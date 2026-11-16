#!/usr/bin/env python3
"""Publish a reviewed draft locally; commit/push the generated changes to deploy."""
import argparse,json,runpy
from refresh_google_play import ROOT,read_json,save
from news_pages import validate
cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('slug',help='Reviewed slug in news-drafts.json');args=cli.parse_args()
drafts=read_json(ROOT/'news-drafts.json',[]);post=next((p for p in drafts if p['slug']==args.slug),None)
if post is None:cli.error('Draft not found')
validate(post);published=read_json(ROOT/'news.json',[])
if any(p['slug']==post['slug'] for p in published):cli.error('Already published')
save(ROOT/'news.json',published+[post]);save(ROOT/'news-drafts.json',[p for p in drafts if p['slug']!=args.slug])
runpy.run_path(str(ROOT/'scripts/build-search-pages.py'),run_name='__main__')
