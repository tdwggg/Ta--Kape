<?php
// Ta' Kape — PHP mirror of Flask "/" route.
// Deploy: upload this folder to any Apache/PHP host (cPanel, InfinityFree, XAMPP htdocs).
// Run:  php -S localhost:8000   then open http://localhost:8000/index.php
// Flask equivalent: python app.py  ->  http://localhost:5000/
$tpl = @file_get_contents(__DIR__ . '/templates/index.html');
if ($tpl === false) { http_response_code(500); echo "templates/index.html missing"; exit; }
$tpl = str_replace("{{ url_for('static', filename='style.css') }}", "static/style.css", $tpl);
$tpl = str_replace('{{ url_for("static", filename="style.css") }}', "static/style.css", $tpl);
$tpl = str_replace("{{ url_for('static', filename='app.js') }}", "static/app.js", $tpl);
$tpl = str_replace('{{ url_for("static", filename="app.js") }}', "static/app.js", $tpl);
echo $tpl;
