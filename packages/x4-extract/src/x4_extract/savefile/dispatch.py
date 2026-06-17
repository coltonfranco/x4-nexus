"""Depth-counter visitor dispatch over a streamed X4 save file.

The naive `iterparse(tag=...)` over a save file is a trap: X4's <component> is
recursively nested (cluster → sector → zone → station → module), so a tag filter
fires on every nested component and lxml accumulates entire subtrees in memory
before the outer end event fires.

This module's pattern: walk start/end events with a depth counter and a small
stack of (tag, class) pairs. Visitors register against an exact (depth, tag, class)
target — a station is `("component", "station")` at depth 4 under savegame/universe.

After dispatching, the element AND its already-visited prior siblings are cleared
from the parent so memory is bounded to roughly one subtree at a time.

EXEMPLAR. New save-state extractors (orders, economy_log, ...) register their
visitor here and never touch iterparse directly.
"""

from __future__ import annotations

import gzip
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import IO, cast

from lxml import etree

Visitor = Callable[[etree._Element], None]


@dataclass(frozen=True, slots=True)
class Target:
    """An element to dispatch on, identified by depth + tag + optional class attribute.

    `depth=None` is a WILDCARD: match at any depth. Required for entities X4 nests
    recursively at variable depth — ships dock on ships/stations and sit in build
    queues, so a flying ship is at depth 15 but a docked one is much deeper. Fixed
    depths still cover non-recursive sections (meta, faction relations) and let the
    dispatcher skip whole depths cheaply.
    """

    tag: str
    depth: int | None = None
    class_attr: str | None = None     # match <tag class="..."> when set
    parent_tag: str | None = None     # additional guard: only match under this parent

    def matches(self, elem: etree._Element, depth: int, parent_tag: str | None) -> bool:
        if self.depth is not None and depth != self.depth:
            return False
        if elem.tag != self.tag:
            return False
        if self.class_attr is not None and elem.get("class") != self.class_attr:
            return False
        return not (self.parent_tag is not None and parent_tag != self.parent_tag)


@dataclass(slots=True)
class Registration:
    target: Target
    visitor: Visitor


def stream_save(path: Path, registrations: Iterable[Registration]) -> None:
    """Open a gzipped save file and dispatch its elements to registered visitors.

    Memory note: peak working set is bounded by the largest subtree any visitor
    consumes — typically a single station (~few MB). Do NOT hold references to
    elements past visitor return; they will be cleared.
    """
    regs = list(registrations)
    with gzip.open(path, "rb") as gz:
        # GzipFile satisfies the IO[bytes] protocol structurally; mypy uses nominal typing.
        _dispatch(cast("IO[bytes]", gz), regs)


def _dispatch(stream: IO[bytes], regs: list[Registration]) -> None:
    depth = 0
    parent_stack: list[str] = []     # tag names at each depth, for parent_tag matching

    # A real save has millions of elements but targets are sparse. Index registrations so
    # most elements are rejected by one dict lookup: fixed-depth targets by their depth,
    # wildcard (depth=None) targets by tag. Matching uses elem.get() — never a per-element
    # attrib dict, which was the original O(elements x registrations) perf cliff.
    #
    # `<component>` is by far the commonest tag (every cluster/sector/zone/station/ship/
    # module is one), and ~6 collectors wildcard-register on it — distinguished only by
    # `class`. Keying those by (tag, class) turns "call matches() on all 6 for every one of
    # millions of components" into a single dict lookup that misses for the classes we never
    # extract. Profiling attributed ~1.5s of the dispatch overhead to that redundant matching.
    by_depth: dict[int, list[Registration]] = {}
    wc_plain: dict[str, list[Registration]] = {}                 # wildcard, no class filter
    wc_class: dict[tuple[str, str], list[Registration]] = {}     # wildcard + class_attr
    for reg in regs:
        t = reg.target
        if t.depth is not None:
            by_depth.setdefault(t.depth, []).append(reg)
        elif t.class_attr is not None:
            wc_class.setdefault((t.tag, t.class_attr), []).append(reg)
        else:
            wc_plain.setdefault(t.tag, []).append(reg)
    wc_class_tags = {tag for tag, _ in wc_class}  # only fetch class for tags that need it

    context = etree.iterparse(stream, events=("start", "end"), huge_tree=True)
    for event, elem in context:
        if event == "start":
            depth += 1
            parent_stack.append(elem.tag)
            continue

        # end event — only the registrations that could possibly match this element.
        tag = elem.tag
        candidates = by_depth.get(depth)
        wildcards = wc_plain.get(tag)
        class_wilds = None
        if tag in wc_class_tags:
            cls = elem.get("class")
            if cls is not None:
                class_wilds = wc_class.get((tag, cls))
        if candidates or wildcards or class_wilds:
            parent_tag = parent_stack[-2] if len(parent_stack) >= 2 else None
            for reg in (*(candidates or ()), *(wildcards or ()), *(class_wilds or ())):
                if reg.target.matches(elem, depth, parent_tag):
                    reg.visitor(elem)
                    break  # one visitor per element; visitors are mutually exclusive

        # Free this element AND prior siblings already dispatched.
        # Walking up keeps the universe/component containment from growing unbounded.
        elem.clear(keep_tail=True)
        while elem.getprevious() is not None:
            parent = elem.getparent()
            if parent is None:
                break
            del parent[0]

        depth -= 1
        parent_stack.pop()

    del context  # release the parser eagerly
