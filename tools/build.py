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
        + open('src/economy.js').read() + open('src/i18n.js').read() + open('src/i18n-x.js').read() + open('src/client.js').read())
# 联机服务器地址：写在 server/url.txt 里（一行，https://…）。没有这个文件 = 纯单机
# 平台包先不带联机（CrazyGames 对联机游戏另有要求，还没做），只有 GitHub 测试版带
game_solo = game
if os.path.exists('server/url.txt'):
    game = game.replace("/*NET_URL*/''", "'" + open('server/url.txt').read().strip() + "'")
html = tpl.replace('/*GAME*/', game).replace('<!--PLATFORM_HEAD-->\n', '')
open('index.html', 'w').write(html)
if not os.path.exists('three.module.min.js'):
    import shutil; shutil.copy('vendor/three.module.min.js', 'three.module.min.js')
print('index.html', len(html))

# ---- 平台包：release/last-cookie-<平台>/ 和同名 zip（index.html 在 zip 根目录）----
# 和测试版的区别：换上真的平台包装（src/platform.js）、加载平台 SDK、关掉调试入口
import shutil, zipfile
SDK = {'crazygames': '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
       'poki': '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'}
a, z = game_solo.index('/*PLATFORM_START*/'), game_solo.index('/*PLATFORM_END*/')
pgame = game_solo[:a] + open('src/platform.js').read() + game_solo[z:]
dbg = "const DEBUG = /[?&]debug/.test(location.search);"
assert dbg in pgame; pgame = pgame.replace(dbg, "const DEBUG = false;")
shutil.rmtree('release', ignore_errors=True)
for site, tag in SDK.items():
    out = 'release/last-cookie-' + site; os.makedirs(out)
    open(out + '/index.html', 'w').write(tpl.replace('/*GAME*/', pgame).replace('<!--PLATFORM_HEAD-->', tag))
    shutil.copy('three.module.min.js', out + '/three.module.min.js')
    shutil.copytree('assets', out + '/assets')   # 商店角色卡片、图标（tools/assets.py 生成）
    with zipfile.ZipFile(out + '.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, _, fs in os.walk(out):
            for f in sorted(fs): full = os.path.join(root, f); zf.write(full, os.path.relpath(full, out))
    print(site, 'zip', os.path.getsize(out + '.zip') // 1024, 'KB')

# ---- 联机服务器：把 sim.js + room.js + worker.src.js 拼成 server/worker.js（部署用） ----
sim = open('src/sim.js').read().replace("if (typeof module !== 'undefined') module.exports = SIM;\n", "")
room = open('server/room.js').read().replace("if (typeof module !== 'undefined') module.exports = { RoomCore, GATHER_MS };\n", "")
open('server/worker.js', 'w').write('// 自动生成，别手改：python3 tools/build.py\n' + sim + room + open('server/worker.src.js').read())
print('server/worker.js', os.path.getsize('server/worker.js') // 1024, 'KB')
