# 拼出 GitHub 测试版 index.html（仓库根目录，Pages 直接用）
# 用法：python3 tools/build.py
import base64, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
tpl = open('src/template.html').read()
font = base64.b64encode(open('fonts/LilitaOne-Regular.ttf', 'rb').read()).decode()
tpl = tpl.replace("url('fonts/LilitaOne.woff2') format('woff2')", "url(data:font/ttf;base64,%s) format('truetype')" % font)
# three.js 只从同目录加载（Poki 不允许外部请求，不再回退到 CDN）
game = ("const THREE = await import('./three.module.min.js');\n"
        + open('src/sim.js').read().replace("if (typeof module !== 'undefined') module.exports = SIM;\n", "")
        + open('src/i18n.js').read() + open('src/client.js').read())
html = tpl.replace('/*GAME*/', game).replace('<!--PLATFORM_HEAD-->\n', '')
open('index.html', 'w').write(html)
if not os.path.exists('three.module.min.js'):
    import shutil; shutil.copy('vendor/three.module.min.js', 'three.module.min.js')
print('index.html', len(html))
