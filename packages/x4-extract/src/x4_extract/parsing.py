"""Shared parsing helpers for XML-backed extraction.

X4 XML stores many numeric attributes as strings, and some files use float-formatted
values for integer fields. These helpers keep that coercion policy consistent across
extractors.
"""

from __future__ import annotations

from lxml import etree


def xml_attr_int(el: etree._Element | None, attr: str) -> int | None:
    """Return an integer XML attribute, tolerating float-formatted integer strings."""
    if el is None:
        return None
    value = el.get(attr)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return int(float(value))


def xml_attr_int_or_none(el: etree._Element | None, attr: str) -> int | None:
    """Return an integer XML attribute, or None when coercion fails."""
    try:
        return xml_attr_int(el, attr)
    except ValueError:
        return None


def xml_attr_float(el: etree._Element | None, attr: str) -> float | None:
    """Return a float XML attribute, or None when it is missing or invalid."""
    if el is None:
        return None
    value = el.get(attr)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def xml_attr_bool(el: etree._Element | None, attr: str) -> bool | None:
    """Return an X4 boolean XML attribute encoded as "1"."""
    if el is None:
        return None
    value = el.get(attr)
    if value is None:
        return None
    return value == "1"


def str_int(value: str | None) -> int | None:
    """Return an integer from a string, tolerating float-formatted integer strings."""
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def str_float(value: str | None) -> float | None:
    """Return a float from a string, or None when it is missing or invalid."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None
