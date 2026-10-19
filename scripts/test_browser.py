"""Actual browser workflow on the licensed real recordings; no human listening claim."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import audio
from playwright.sync_api import sync_playwright, expect
from verify_export import verify

ROOT=audio.ROOT
RESULTS=ROOT/'results'


def main():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    server=subprocess.Popen([sys.executable,str(ROOT/'app.py')],env={**os.environ,'PORT':str(port)},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    steps=[]
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/api/config',timeout=1).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as p:
            browser=p.chromium.launch(args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1320,'height':1050},accept_downloads=True)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{port}')
            page.locator('#demo').click()
            expect(page.locator('.track')).to_have_count(2)
            expect(page.locator('#notice')).to_contain_text('Real speech and music loaded')
            steps.append('Loaded licensed real speech and music via visible demo button')
            first=page.locator('.track').nth(0)
            first.locator('[data-setting=lufs]').fill('-24')
            first.locator('[data-setting=lufs]').press('Tab')
            first.locator('.prepare').click()
            expect(first.locator('.tag')).to_have_text('Target met',timeout=45000)
            page.wait_for_function("document.querySelector('.processed').readyState >= 2")
            first.locator('.original').evaluate('(a)=>{a.currentTime=2;return a.play()}')
            page.wait_for_timeout(200)
            first.locator('.switch').click()
            page.wait_for_function("!document.querySelector('.processed').paused")
            position=first.locator('.processed').evaluate('(a)=>a.currentTime')
            assert 2<=position<3.5,position
            assert first.locator('.original').evaluate('(a)=>a.paused')
            first.locator('.processed').evaluate('(a)=>a.pause()')
            steps.append(f'Prepared -24 LUFS speech and switched playback at corresponding position ({position:.3f}s); decoded playback only, no human listening')
            with page.expect_download() as event:page.locator('#save').click()
            project=ROOT/'.cache/browser-project.json';event.value.save_as(project)
            saved=json.loads(project.read_text());assert saved['files'][0]['settings']['lufs']==-24
            page.reload()
            expect(page.locator('.tag').nth(0)).to_have_text('Reattach source')
            page.locator('#files').set_input_files([str(ROOT/'.cache/speech.wav'),str(ROOT/'.cache/music.wav')])
            expect(page.locator('.tag').nth(1)).to_have_text('Measured',timeout=45000)
            expect(first.locator('[data-setting=lufs]')).to_have_value('-24')
            steps.append('Reloaded and reattached real files through file picker; matching hashes restored saved targets')
            page.locator('#clear').click()
            page.locator('#project').set_input_files(str(project))
            expect(page.locator('.track')).to_have_count(2)
            # A valid but altered recording with the SAME name must not inherit the target.
            changed=bytearray((ROOT/'.cache/speech.wav').read_bytes());changed[-100]^=1
            page.locator('#files').set_input_files({'name':'speech.wav','mimeType':'audio/wav','buffer':bytes(changed)})
            expect(page.locator('.track')).to_have_count(3)
            expect(page.locator('.tag').nth(0)).to_have_text('Reattach source')
            expect(page.locator('.track').nth(2).locator('[data-setting=lufs]')).to_have_value('-23')
            steps.append('Rejected settings restoration for modified same-name source; exact source remained unattached')
            page.locator('#project').set_input_files(str(project))
            expect(page.locator('.track')).to_have_count(2)
            page.locator('#demo').click()
            expect(page.locator('#notice')).to_contain_text('Real speech and music loaded',timeout=45000)
            expect(first.locator('[data-setting=lufs]')).to_have_value('-24')
            steps.append('Imported project JSON and recovered targets after source hash matching')
            for card in page.locator('.track').all():
                card.locator('.prepare').click()
                expect(card.locator('.tag')).to_have_text('Target met',timeout=45000)
            with page.expect_download(timeout=60000) as event:page.locator('#export').click()
            archive=ROOT/'demo/browser-export.zip';event.value.save_as(archive)
            expect(page.locator('#notice')).to_contain_text('Complete export')
            result=verify(archive,ROOT/'.cache');assert result['passed'],result
            (RESULTS/'browser-export-verification.json').write_text(json.dumps(result,indent=2)+'\n')
            steps.append('Exported WAV ZIP in browser; independently reopened and measured every output using libsndfile, pyloudnorm and scipy')
            page.screenshot(path=str(RESULTS/'browser-demo.png'),full_page=True)
            # Real input, unattainable targets: check the visible partial-batch path.
            first.locator('[data-setting=lufs]').fill('-9');first.locator('[data-setting=lufs]').press('Tab')
            first.locator('[data-setting=peak]').fill('-9');first.locator('[data-setting=peak]').press('Tab')
            with page.expect_download(timeout=60000) as event:page.locator('#export').click()
            partial=ROOT/'.cache/browser-partial.zip';event.value.save_as(partial)
            expect(page.locator('#notice')).to_contain_text('PARTIAL EXPORT')
            result=verify(partial,ROOT/'.cache');assert result['passed'],result
            assert not result['files'][0]['checks']['loudness_target']
            (RESULTS/'partial-export-verification.json').write_text(json.dumps(result,indent=2)+'\n')
            steps.append('Real speech with -9 LUFS / -9 dBTP produced explicit partial export; independent meter confirmed failed loudness target and preserved peak limit')
            # Independent Chromium decoder opens a generated WAV as well.
            import zipfile
            with zipfile.ZipFile(archive) as z:
                wav=z.read(next(n for n in z.namelist() if n.endswith('.wav')))
            page.locator('#clear').click()
            page.locator('#files').set_input_files({'name':'reopened-export.wav','mimeType':'audio/wav','buffer':wav})
            expect(page.locator('.track')).to_have_count(1)
            page.wait_for_function("document.querySelector('.original').readyState >= 2")
            duration=page.locator('.original').evaluate('(a)=>a.duration')
            assert abs(duration-14.84)<.01
            steps.append('Reopened exported PCM 24-bit WAV in browser decoder; duration 14.84 seconds')
            assert not errors,errors
            evidence={'passed':True,'browser':browser.version,'steps':steps,'page_errors':errors,'human_listening':False}
            (RESULTS/'browser-workflow.json').write_text(json.dumps(evidence,indent=2)+'\n')
            print(json.dumps(evidence,indent=2))
            browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()


if __name__=='__main__':main()
