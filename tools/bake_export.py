import asyncio, base64, json, sys
from playwright.async_api import async_playwright
async def main(out):  # needs `npm run dev` on 127.0.0.1:5173
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':640,'height':360})
        pg.on('pageerror', lambda e: print('pageerror:', e))
        pg.on('console', lambda m: print('console:', m.text) if m.type=='error' else None)
        await pg.goto("http://127.0.0.1:5173/?export&test")
        await pg.wait_for_function("document.title=='export-ready'", timeout=300000)
        h = await pg.evaluate("window.__export.header")
        bl = await pg.evaluate("window.__export.blob")
        open(out+'/scene.json','w').write(h); open(out+'/scene.bin','wb').write(base64.b64decode(bl))
        d=json.loads(h); from collections import Counter
        print(len(d['meshes']), Counter(m['mode'] for m in d['meshes']), sum(m['vcount'] for m in d['meshes']), 'verts')
        await b.close()
asyncio.run(main(sys.argv[1]))
