"""
Unit tests for scraper metadata extraction.
Run with: pytest backend/tests/test_scraper.py -q
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.utils.scraper import _extract_meta_tags


def test_resolves_relative_og_image():
    html = '<html><head><meta property="og:image" content="/images/logo.png"></head><body></body></html>'
    meta = {'logo_url': None}
    _extract_meta_tags(html, meta, 'https://www.example.cz/product/123')
    assert meta['logo_url'] == 'https://www.example.cz/images/logo.png'


def test_resolves_protocol_relative_og_image():
    html = '<html><head><meta property="og:image" content="//cdn.example.com/img.png"></head></html>'
    meta = {'logo_url': None}
    _extract_meta_tags(html, meta, 'https://shop.example.com/item')
    assert meta['logo_url'] == 'https://cdn.example.com/img.png'


def test_keeps_absolute_og_image():
    html = '<html><head><meta property="og:image" content="https://cdn.example.com/a.png"></head></html>'
    meta = {'logo_url': None}
    _extract_meta_tags(html, meta, 'https://shop.example.com/item')
    assert meta['logo_url'] == 'https://cdn.example.com/a.png'
