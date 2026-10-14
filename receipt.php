<?php
// Ta' Kape — PHP mirror of Flask "/receipt" route. Auto-prints 2 copies.
$order_id = $_GET['order_id'] ?? 'POS-0000';
$total = $_GET['total'] ?? '0.00';
$subtotal = $_GET['subtotal'] ?? $total;
$tip = $_GET['tip'] ?? '0.00';
$beans = $_GET['beans'] ?? '0';
$customer = $_GET['customer'] ?? 'Walk-in';
$cashier = $_GET['cashier'] ?? 'Cashier';
$payment = $_GET['payment'] ?? 'cash';
$items_json = $_GET['items_json'] ?? '[]';
$date = date('Y-m-d H:i');
$e = fn($s) => htmlspecialchars($s, ENT_QUOTES);
?>
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt <?= $e($order_id) ?> — Ta' Kape</title>
<style>*{box-sizing:border-box}body{font-family:'Courier New',monospace;background:#9ba0a5;margin:0;padding:12px}.bar{max-width:640px;margin:0 auto 12px;background:#4a4e51;color:#f5c15a;padding:10px 14px;border-radius:10px;display:flex;gap:8px;align-items:center;justify-content:space-between}.bar button{padding:10px 16px;border-radius:8px;border:2px solid #222;font-weight:900;cursor:pointer}.wrap{max-width:640px;margin:0 auto;display:grid;gap:14px}@media(min-width:640px){.wrap{grid-template-columns:1fr 1fr}}.rcpt{background:#fff;max-width:300px;margin:0 auto;padding:16px 14px;border:2px solid #111}.rcpt h2,.rcpt h3,.rcpt p{text-align:center;margin:4px 0}.cement{height:8px;background:repeating-linear-gradient(-45deg,#4a4e51 0 8px,#9ba0a5 8px 16px);margin:8px -14px}.row{display:flex;justify-content:space-between;font-size:13px;margin:3px 0;gap:8px}.dv{border-top:1px dashed #111;margin:8px 0}.tot{font-size:17px;font-weight:900}.stamp{display:inline-block;border:2px solid #111;padding:2px 10px;font-weight:900;transform:rotate(-4deg);margin-top:6px}.barcode{text-align:center;letter-spacing:4px;margin-top:8px;font-weight:900}@media print{.bar{display:none}body{background:#fff;padding:0}.rcpt{border:none}.rcpt:last-child{break-before:page}}</style>
</head><body>
<div class="bar"><span>🧾 <?= $e($order_id) ?> • 2 copies auto-print</span><span><button onclick="window.print()">🖨 Print</button> <button onclick="window.close()">Close</button></span></div>
<div class="wrap"><?php foreach (['CUSTOMER COPY','CASHIER COPY'] as $copy): ?>
<div class="rcpt"><h2>TA' KAPE</h2><p>123 Cement St. • 0917-000-0000</p><h3><?= $copy ?></h3><div class="cement"></div>
<div class="row"><span>Order:</span><b><?= $e($order_id) ?></b></div><div class="row"><span>Date:</span><span><?= $e($date) ?></span></div>
<div class="row"><span>Customer:</span><span><?= $e($customer) ?></span></div><div class="row"><span>Cashier:</span><span><?= $e($cashier) ?></span></div>
<div class="row"><span>Pay:</span><span><?= $e($payment) ?></span></div><div class="dv"></div>
<div class="items"></div><div class="dv"></div>
<div class="row"><span>Subtotal:</span><span>₱<?= $e($subtotal) ?></span></div><div class="row"><span>Tip:</span><span>₱<?= $e($tip) ?></span></div>
<div class="row tot"><span>TOTAL:</span><span>₱<?= $e($total) ?></span></div><div class="dv"></div>
<p>🫘 You earned <?= $e($beans) ?> beans!</p><p style="font-size:11px">Thank you — brewed on concrete.<br>Non-VAT demo receipt.</p>
<div style="text-align:center"><span class="stamp"><?= explode(' ',$copy)[0] ?></span><div class="barcode">*<?= $e($order_id) ?>*</div></div></div>
<?php endforeach; ?></div>
<script>const raw=<?= $items_json ?>;function h(items){if(!items||!items.length)return '<div class="row"><span>No items</span></div>';const m={};items.forEach(i=>{const k=i.name+'|'+i.price;m[k]=m[k]||{...i,qty:0};m[k].qty++});return Object.values(m).map(o=>`<div class="row"><span>${o.qty}x ${o.name}</span><span>₱${(o.price*o.qty).toFixed(2)}</span></div>`).join('')}document.querySelectorAll('.items').forEach(el=>el.innerHTML=h(raw));window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body></html>
