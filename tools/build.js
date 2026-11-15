/* Gộp cả trò chơi thành một tệp HTML duy nhất.
   node tools/build.js              -> dist/ngan-ha-vu-mon.html (mở trực tiếp được, kèm luôn thư viện 3D)
   node tools/build.js fragment F   -> tệp không có <html>/<head>/<body>, dùng cho nơi tự bọc khung trang;
                                       thư viện 3D nạp từ cdnjs
   node tools/build.js fragment F local  -> như trên nhưng nhúng thẳng thư viện, để thử khi không có mạng */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const body = html.split('<!--GAME:BEGIN-->')[1].split('<!--GAME:END-->')[0].trim();
const css = read('css/style.css');
const js = ['core', 'audio', 'scene3d', 'gfx', 'ui', 'main'].map((n) => read('js/' + n + '.js')).join('\n;\n');
if (js.indexOf('</script') >= 0) throw new Error('Mã nguồn chứa chuỗi </script, không gộp được');
const three = read('vendor/three.min.js');
if (three.indexOf('</script') >= 0) throw new Error('Thư viện chứa chuỗi </script, không nhúng được');

const THREE_CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&family=Yeseva+One&display=swap">';

const mode = process.argv[2] || 'standalone';
const inlineThree = mode !== 'fragment' || process.argv[4] === 'local';
const lib = inlineThree ? '<script>\n' + three + '\n</script>\n' : THREE_CDN + '\n';
const inner = '<style>\n' + css + '\n</style>\n' + body + '\n' + lib + '<script>\n' + js + '\n</script>\n';

let out, text;
if (mode === 'fragment') {
  out = process.argv[3] || path.join(root, 'dist', 'ngan-ha-vu-mon.fragment.html');
  text = '<title>Ngân Hà Vũ Môn</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + fonts + '\n' + inner;
} else {
  out = process.argv[3] || path.join(root, 'dist', 'ngan-ha-vu-mon.html');
  text = '<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n' +
    '<meta name="theme-color" content="#04070d">\n<title>Ngân Hà Vũ Môn</title>\n' + fonts + '\n</head>\n<body>\n' + inner + '</body>\n</html>\n';
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log(out + '  ' + (text.length / 1024).toFixed(0) + ' KB');
