#!/usr/bin/env python3
"""Build local static pages from the reviewed JA Markdown. Never deploys or fetches."""
import argparse
import datetime
import hashlib
import html
import ipaddress
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
FIELDS = ('operatorName', 'effectiveDate', 'contactLabel', 'contactUrl',
          'privacyUrl', 'supportUrl', 'externalDataHandling', 'hostingDataHandling', 'supportDataHandling')

def public_host(hostname):
    host = hostname.lower().rstrip('.')
    reserved = ('example.com', 'example.org', 'example.net', 'localhost', 'example', 'invalid', 'test', 'local', 'internal')
    if not host or any(host == item or host.endswith('.' + item) for item in reserved):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        # Exclude shortened/encoded numeric IP spellings too. This is syntax
        # validation, not DNS resolution or proof of public reachability.
        return '.' in host and re.fullmatch(r'[a-z0-9.-]+', host) is not None and re.fullmatch(r'[a-z][a-z0-9-]*', host.rsplit('.', 1)[-1]) is not None

def valid_url(value, contact=False):
    if not isinstance(value, str) or re.search(r'[\s\x00-\x1f\x7f]', value):
        return False
    try:
        parsed = urlsplit(value)
        if contact and parsed.scheme == 'mailto':
            return not parsed.query and not parsed.fragment and bool(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', parsed.path)) and public_host(parsed.path.rsplit('@', 1)[-1])
        return parsed.scheme == 'https' and public_host(parsed.hostname or '') and not parsed.username and not parsed.password and not parsed.fragment and not parsed.query
    except ValueError:
        return False

def inline(text):
    # Authored content only; owner-supplied values are inserted after parsing and
    # HTML-escaped, so contact/operator text cannot introduce markup or scripts.
    escaped = html.escape(text)
    return re.sub(r'\[([^\]]+)\]\((privacy\.html|support\.html)\)', r'<a href="\2">\1</a>', escaped)

def markdown(text):
    chunks = []
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = block.splitlines()
        if block.startswith('## '): chunks.append('<h2>' + inline(block[3:]) + '</h2>')
        elif all(line.startswith('- ') for line in lines): chunks.append('<ul>' + ''.join('<li>' + inline(line[2:]) + '</li>' for line in lines) + '</ul>')
        else: chunks.append('<p>' + inline(' '.join(lines)) + '</p>')
    return '\n'.join(chunks)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=HERE / 'public-fields.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, help='Private build record outside --output; defaults to <output>.local-build.json')
    parser.add_argument('--draft', action='store_true', help='Marked local preview only; no publication approval implied')
    args = parser.parse_args()
    values = json.loads(args.config.read_text())
    if not args.draft:
        missing = [key for key in FIELDS if not isinstance(values.get(key), str) or not values[key].strip()]
        # Page publication approval is separate from the application's release
        # privacy review, whose actual state is retained in the private record.
        if values.get('publicInformationApproved') is not True: missing.append('publicInformationApproved')
        if missing: parser.error('Publication is pending; missing approved fields: ' + ', '.join(missing))
        for key in ('privacyUrl', 'supportUrl', 'contactUrl'):
            if not valid_url(values[key], contact=key == 'contactUrl'): parser.error('Invalid public endpoint: ' + key)
        try: datetime.date.fromisoformat(values['effectiveDate'])
        except ValueError: parser.error('effectiveDate must be an approved YYYY-MM-DD date')
        if any(re.search(r'\{\{|要確定|未確定|example\.(com|org|net)', values[key]) for key in FIELDS): parser.error('Unresolved placeholder in publication input')
    safe = {key: html.escape(str(values.get(key) or '未確定（公開不可）')) for key in FIELDS}
    copyright_holder = values.get('copyrightHolder')
    copyright_footer = '<br>著作権者：' + html.escape(copyright_holder.strip()) if isinstance(copyright_holder, str) and copyright_holder.strip() else ''
    endpoint = values.get('contactUrl')
    safe['contactLink'] = '<a href="' + html.escape(endpoint, quote=True) + '">問い合わせる</a>' if endpoint and valid_url(endpoint, contact=True) else '問い合わせ先は未確定です。この下書きからは送信できません。'
    pages = {}
    for stem, source, title in [('privacy', 'privacy-policy-ja.md', 'プライバシーポリシー'), ('support', 'support-ja.md', 'サポート')]:
        source_path = HERE.parent / source
        content = source_path.read_text().split('<!-- PUBLIC START -->', 1)[1].split('<!-- PUBLIC END -->', 1)[0]
        body = markdown(content)
        body = re.sub(r'\{\{(\w+)\}\}', lambda match: safe[match[1]], body)
        if '{{' in body: raise RuntimeError('Unresolved content template')
        status = '<p class="draft">公開前の下書き。正式情報・最終バイナリ未確認。公開・審査提出には使用できません。</p>' if args.draft else ''
        robots = '<meta name="robots" content="noindex,nofollow">' if args.draft else ''
        nav_privacy = 'privacy.html' if args.draft else values['privacyUrl']
        nav_support = 'support.html' if args.draft else values['supportUrl']
        if not args.draft: body = body.replace('href="privacy.html"', 'href="' + html.escape(nav_privacy, quote=True) + '"')
        pages[stem + '.html'] = f'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">{robots}<meta name="referrer" content="no-referrer"><title>錯視館 — {title}</title><link rel="stylesheet" href="site.css"></head>
<body><header><div class="brand">錯視館 <small>さくしかん</small></div><nav aria-label="公開情報"><a href="{html.escape(nav_support, quote=True)}">サポート</a><a href="{html.escape(nav_privacy, quote=True)}">プライバシー</a></nav></header>
<main>{status}<h1>{title}</h1>{body}</main><footer>運営者：{safe['operatorName']}{copyright_footer}</footer></body></html>
'''
    # Never mix a newly reviewed site with old pages, scripts or private records.
    # A caller must choose a fresh directory; this builder does not delete files.
    if args.output.is_symlink() or (args.output.exists() and
            (not args.output.is_dir() or any(args.output.iterdir()))):
        parser.error('Output must be a new or empty non-symlink directory')
    manifest_path = args.manifest or args.output.with_name(args.output.name + '.local-build.json')
    if manifest_path.resolve().is_relative_to(args.output.resolve()):
        parser.error('Build manifest must be outside the public output directory')
    if manifest_path.exists() or manifest_path.is_symlink():
        parser.error('Build manifest already exists; choose a fresh path')
    args.output.mkdir(parents=True, exist_ok=True)
    pages['site.css'] = (HERE / 'site.css').read_text()
    for name, contents in pages.items(): (args.output / name).write_text(contents)
    manifest = {'schemaVersion': 1, 'draft': args.draft, 'deployed': False, 'publicReachabilityVerified': False,
                'approvalFlagsAreOwnerAssertionsNotTechnicalProof': True,
                'publicInformationApproved': values.get('publicInformationApproved') is True,
                'productionPrivacyReviewConfirmed': values.get('productionPrivacyReviewConfirmed') is True,
                'files': {name: hashlib.sha256(contents.encode()).hexdigest() for name, contents in pages.items()}}
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
