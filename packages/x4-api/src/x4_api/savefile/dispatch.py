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
from typing import IO

from lxml import etree

Visitor = Callable[[etree._Element], None]


@dataclass(frozen=True, slots=True)
class Target:
    """An element to dispatch on, identified by depth + tag + optional class attribute."""

    depth: int
    tag: str
    class_attr: str | None = None     # match <tag class="..."> when set
    parent_tag: str | None = None     # additional guard: only match under this parent

    def matches(self, depth: int, tag: str, attrib: dict[str, str], parent_tag: str | None) -> bool:
        if depth != self.depth or tag != self.tag:
            return False
        if self.class_attr is not None and attrib.get("class") != self.class_attr:
            return False
        if self.parent_tag is not None and parent_tag != self.parent_tag:
            return False
        return True


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
        _dispatch(gz, regs)


def _dispatch(stream: IO[bytes], regs: list[Registration]) -> None:
    depth = 0
    parent_stack: list[str] = []     # tag names at each depth, for parent_tag matching

    context = etree.iterparse(stream, events=("start", "end"), huge_tree=True)
    for event, elem in context:
        if event == "start":
            depth += 1
            parent_stack.append(elem.tag)
            continue

        # end event
        parent_tag = parent_stack[-2] if len(parent_stack) >= 2 else None
        for reg in regs:
            if reg.target.matches(depth, elem.tag, dict(elem.attrib), parent_tag):
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
