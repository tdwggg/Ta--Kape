/* Ta' Kape SPA — Firebase Auth + Firestore (v8 compat) */
const firebaseConfig = {
  apiKey: "AIzaSyDNhUdxQXnBjOQ8edNIk58sWs2XbIQiJbQ",
  authDomain: "coffee-shop-265e8.firebaseapp.com",
  projectId: "coffee-shop-265e8",
  storageBucket: "coffee-shop-265e8.firebasestorage.app",
  messagingSenderId: "1071737004518",
  appId: "1:1071737004518:web:68a258bc0a3a06a8c03627"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STAFF_CODES = { cashier: "TAKAPE-POS-2026", admin: "TAKAPE-ADMIN-2026" };
const DEMO_MENU = [
  { name: "Espresso Shot", price: 80, stock: 60, cat: "hot", desc: "Bold single-origin shot" },
  { name: "Cement Latte", price: 140, stock: 40, cat: "hot", desc: "Signature creamy latte" },
  { name: "Kapeng Barako", price: 110, stock: 8, cat: "hot", desc: "Strong Batangas brew" },
  { name: "Iced Americano", price: 120, stock: 35, cat: "iced", desc: "Chilled + bold" },
  { name: "Caramel Macchiato", price: 165, stock: 25, cat: "iced", desc: "Caramel drizzle" },
  { name: "Mocha Cement", price: 155, stock: 6, cat: "hot", desc: "Choco + espresso" },
  { name: "Butter Croissant", price: 95, stock: 55, cat: "pastry", desc: "Flaky French" },
  { name: "Ube Ensaymada", price: 85, stock: 30, cat: "pastry", desc: "Filipino favorite" }
];

let currentUserRole = "guest", currentUserDoc = null, authRole = "customer";
let productsCache = [], cart = [], posCart = [], payMethod = "cod";
let activeOrderId = null, riderOrderId = null, watchId = null, sharing = false;
let reportTarget = "rider", unsubs = [];

const $ = id => document.getElementById(id);
const peso = n => (parseFloat(n || 0)).toFixed(2);
function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; $("toasts").appendChild(t); setTimeout(() => t.remove(), 3500); }
function clearUnsubs() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; }

/* ---------- NAV ---------- */
function showView(id) {
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll("[data-nav]").forEach(b => b.classList.remove("active"));
  document.getElementById("nav-links").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function goReserve() {
  if (currentUserRole === "customer") { showView("customer-view"); setTimeout(() => $("res-date").focus(), 300); }
  else { showView("auth-view"); toast("Log in as customer to book a table."); }
}
function goTrack() {
  if (currentUserRole === "customer") showView("customer-view");
  else if (currentUserRole === "rider") showView("rider-view");
  else { showView("auth-view"); toast("Log in to track your order."); }
}
function setAuthRole(r) {
  authRole = r;
  document.querySelectorAll(".role-tab").forEach(t => t.classList.toggle("active", t.dataset.role === r));
  $("rider-fields").style.display = r === "rider" ? "block" : "none";
  const staff = (r === "cashier" || r === "admin");
  $("staff-note").classList.toggle("hidden", !staff);
  $("staffcode-wrap").classList.toggle("hidden", !staff);
}
function toggleRegister() { $("register-fields").style.display = "block"; $("btn-do-register").classList.remove("hidden"); toast("Fill up the form, then Submit Registration."); }
function setPay(m) {
  payMethod = m;
  document.querySelectorAll(".pay-tile").forEach(t => t.classList.toggle("active", t.dataset.pay === m));
  $("gcash-box").classList.toggle("hidden", m !== "gcash");
  $("card-box").classList.toggle("hidden", m !== "card");
}

/* ---------- AUTH (unique logins per side) ---------- */
auth.onAuthStateChanged(async user => {
  clearUnsubs();
  if (user) {
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists) { toast("Account has no profile. Contact admin."); await auth.signOut(); return; }
    currentUserDoc = doc.data(); currentUserRole = currentUserDoc.role;
    $("user-display").textContent = (currentUserDoc.fname || user.email) + " • " + currentUserRole;
    $("btn-login-nav").style.display = "none"; $("btn-logout").style.display = "inline-block";
    routeUser(currentUserRole);
  } else {
    currentUserRole = "guest"; currentUserDoc = null; cart = []; posCart = [];
    $("user-display").textContent = "Guest User";
    $("btn-login-nav").style.display = "inline-block"; $("btn-logout").style.display = "none";
    showView("public-view"); loadProducts();
  }
});
function routeUser(role) {
  if (role === "customer") { showView("customer-view"); $("cust-name").textContent = currentUserDoc.fname || ""; $("beans-points").textContent = currentUserDoc.beans || 0; loadProducts(); listenActiveOrder(); listenHistory(); listenMyReservations(); }
  if (role === "cashier") { showView("cashier-view"); $("cashier-name").textContent = currentUserDoc.fname || ""; loadProducts(); listenOnlineOrders(); listenPunches("cashier"); listenReservationsStaff(); calcToday(); }
  if (role === "admin") { showView("admin-view"); loadProducts(); listenAdmin(); }
  if (role === "rider") { showView("rider-view"); loadRiderProfile(); listenAvailable(); }
}
async function register() {
  const email = $("auth-email").value.trim(), pass = $("auth-password").value;
  const fname = $("reg-fname").value.trim(), lname = $("reg-lname").value.trim();
  const mname = $("reg-mname").value.trim(), address = $("reg-address").value.trim(), contact = $("reg-contact").value.trim();
  if (!email || !pass || !fname || !lname || !address || !contact) return toast("Complete required fields (email, password, names, address, contact).");
  if (authRole === "rider") {
    const plate = $("reg-plate").value.trim(), brand = $("reg-brand").value.trim();
    if (!plate || !brand) return toast("Riders must enter plate + motor brand.");
    if (!$("reg-face").files.length && !$("face-data").value) return toast("Riders must attach a face photo.");
  }
  if ((authRole === "cashier" || authRole === "admin") && $("reg-staffcode").value.trim() !== STAFF_CODES[authRole])
    return toast("Wrong staff access code for " + authRole + " side.");
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection("users").doc(cred.user.uid).set({
      role: authRole, fname, lname, mname: mname || "", address, contact,
      plate: $("reg-plate").value.trim() || "", brand: $("reg-brand").value.trim() || "",
      face: $("face-data").value || "", beans: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast("Registered as " + authRole + " ✓");
  } catch (e) { toast(e.message); }
}
async function login() {
  const email = $("auth-email").value.trim(), pass = $("auth-password").value;
  if (!email || !pass) return toast("Enter email + password.");
  // staff tabs need the side code even to log in (unique logins per side)
  if ((authRole === "cashier" || authRole === "admin")) {
    const code = prompt("Enter " + authRole.toUpperCase() + " access code:");
    if (code !== STAFF_CODES[authRole]) return toast("Wrong access code for " + authRole + " side.");
  }
  try {
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    const doc = await db.collection("users").doc(cred.user.uid).get();
    const real = doc.exists ? doc.data().role : null;
    if (real && real !== authRole) { toast("Unique-login check: this account is [" + real + "]. Taking you there."); }
  } catch (e) { toast(e.message); }
}
function logout() { stopShare(); auth.signOut(); }

/* face preview -> tiny dataURL (demo) */
document.addEventListener("change", e => {
  if (e.target && e.target.id === "reg-face") {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); const s = 160 / Math.max(img.width, img.height);
        c.width = img.width * s; c.height = img.height * s;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.7);
        let h = document.getElementById("face-data");
        if (!h) { h = document.createElement("input"); h.type = "hidden"; h.id = "face-data"; document.getElementById("auth-view").appendChild(h); }
        h.value = url;
        $("reg-face-preview").src = url; $("reg-face-preview").classList.remove("hidden"); $("face-initial").style.display = "none";
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  }
});

/* ---------- PRODUCTS ---------- */
function loadProducts() {
  unsubs.push(db.collection("products").onSnapshot(snap => {
    productsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPublic(); renderCustomerMenu(); renderCashierMenu(); renderAdminInv();
  }, err => toast("Products: " + err.message)));
}
function cardHTML(p, withBtn) {
  const st = p.stock <= 0 ? ["out", "SOLD OUT"] : p.stock < 10 ? ["low", "LOW • " + p.stock] : p.stock >= 50 ? ["high", "HIGH • " + p.stock] : ["ok", p.stock + " left"];
  return `<div class="prod"><div class="prod-top"></div><div class="prod-body">
    <h4>${ escapeHtml(p.name) }</h4><div class="price">₱${peso(p.price)} <small>${ escapeHtml(p.cat || "") }</small></div>
    <span class="stock ${st[0]}">${st[1]}</span><p style="font-size:12px;color:#5a6064">${ escapeHtml(p.desc || "") }</p>
    ${withBtn ? `<div class="opt-row"><select id="sz-${p.id}"><option>Regular</option><option>Large +₱20</option><option>Sugar-free</option></select>
    <select id="sg-${p.id}"><option>100% sugar</option><option>50% sugar</option><option>0% sugar</option></select></div>
    <button class="btn btn-secondary btn-sm btn-block" ${p.stock <= 0 ? "disabled" : ""} onclick="addToCart('${p.id}')">${p.stock <= 0 ? "Out of stock" : "Add • ₱" + peso(p.price)}</button>` : `<p>₱${peso(p.price)}</p>`}
  </div></div>`;
}
function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function renderPublic() {
  const q = ($("public-search").value || "").toLowerCase(), f = $("public-filter").value;
  $("public-menu-container").innerHTML = productsCache.filter(p => (!q || p.name.toLowerCase().includes(q)) && (f === "all" || p.cat === f)).map(p => cardHTML(p, false)).join("") || "<p>No items.</p>";
}
function renderCustomerMenu() {
  if (!$("cust-menu-container")) return;
  const q = ($("cust-search").value || "").toLowerCase();
  $("cust-menu-container").innerHTML = `<div class="menu-grid">` + productsCache.filter(p => !q || p.name.toLowerCase().includes(q)).map(p => cardHTML(p, true)).join("") + `</div>`;
}
function renderCashierMenu() {
  if (!$("cashier-menu")) return;
  $("cashier-menu").innerHTML = `<div class="menu-grid">` + productsCache.map(p => `<div class="prod"><div class="prod-top"></div><div class="prod-body"><h4>${escapeHtml(p.name)}</h4><div class="price">₱${peso(p.price)}</div><span class="stock ${p.stock <= 0 ? "out" : p.stock < 10 ? "low" : "ok"}">${p.stock}</span><br><button class="btn btn-secondary btn-sm btn-block" style="margin-top:6px" ${p.stock <= 0 ? "disabled" : ""} onclick="addToPOS('${p.id}')">Punch +</button></div></div>`).join("") + `</div>`;
}
function priceWithSize(p) {
  const sz = document.getElementById("sz-" + p.id);
  let pr = parseFloat(p.price); let size = "Regular";
  if (sz) { size = sz.value; if (size.includes("Large")) pr += 20; }
  const sg = document.getElementById("sg-" + p.id);
  return { pr, size, sugar: sg ? sg.value : "" };
}
function addToCart(id) {
  const p = productsCache.find(x => x.id === id); if (!p || p.stock <= 0) return toast("Out of stock.");
  const { pr, size, sugar } = priceWithSize(p);
  cart.push({ id, name: p.name, price: pr, size, sugar }); renderCart(); toast(p.name + " added.");
}
function renderCart() {
  const m = {}; cart.forEach(i => { const k = i.name + i.size + i.sugar; m[k] = m[k] || { ...i, qty: 0 }; m[k].qty++; });
  let total = 0;
  $("cust-cart").innerHTML = Object.values(m).map(o => { total += o.price * o.qty; return `<li>☕ ${escapeHtml(o.name)} <small>${escapeHtml(o.size)}</small> x${o.qty} — ₱${peso(o.price * o.qty)}</li>`; }).join("") || "<li>Cart empty.</li>";
  $("cust-total").textContent = peso(total);
}
function addToPOS(id) {
  const p = productsCache.find(x => x.id === id); if (!p || p.stock <= 0) return toast("Out of stock.");
  posCart.push({ id, name: p.name, price: parseFloat(p.price) }); renderPOS();
}
function renderPOS() {
  let t = 0; const m = {};
  posCart.forEach(i => { m[i.name] = m[i.name] || { ...i, qty: 0 }; m[i.name].qty++; });
  $("pos-cart").innerHTML = Object.values(m).map(o => { t += o.price * o.qty; return `<li>🧾 ${escapeHtml(o.name)} x${o.qty} — ₱${peso(o.price * o.qty)}</li>`; }).join("") || "<li>No punch yet.</li>";
  $("pos-total").textContent = peso(t);
}
function undoLastPunch() { if (!posCart.length) return toast("Nothing to undo."); const r = posCart.pop(); renderPOS(); toast("Undid: " + r.name); }
function clearPunch() { posCart = []; renderPOS(); }

/* ---------- CUSTOMER CHECKOUT ---------- */
async function checkout() {
  if (currentUserRole !== "customer") return toast("Log in as customer to order.");
  if (!cart.length) return toast("Cart is empty.");
  let ref = "";
  if (payMethod === "gcash") { ref = $("gcash-ref").value.trim(); if (!ref) return toast("Enter GCash ref no. (mock)."); }
  if (payMethod === "card") { if ($("card-num").value.replace(/\D/g, "").length < 12 || !$("card-exp").value || !$("card-cvc").value) return toast("Complete mock card fields."); ref = "CARD-" + $("card-num").value.replace(/\D/g, "").slice(-4); }
  const tip = parseFloat($("cust-tip").value || 0);
  const sub = cart.reduce((s, i) => s + parseFloat(i.price), 0);
  const total = sub + tip;
  try {
    const doc = await db.collection("orders").add({
      customerId: auth.currentUser.uid, customerName: currentUserDoc.fname + " " + currentUserDoc.lname,
      address: currentUserDoc.address, contact: currentUserDoc.contact || "",
      items: cart, tip, subtotal: sub, total, paymentMethod: payMethod, paymentRef: ref,
      status: "Preparing", riderId: "", riderName: "", riderPlate: "", riderBrand: "", riderLat: null, riderLng: null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    for (const i of cart) { const p = productsCache.find(x => x.id === i.id); if (p) db.collection("products").doc(i.id).update({ stock: Math.max(0, (p.stock || 1) - 1) }); }
    const beans = Math.floor(total / 50);
    if (beans > 0) { await db.collection("users").doc(auth.currentUser.uid).update({ beans: (currentUserDoc.beans || 0) + beans }); currentUserDoc.beans = (currentUserDoc.beans || 0) + beans; $("beans-points").textContent = currentUserDoc.beans; }
    cart = []; renderCart(); $("cust-tip").value = 0;
    toast("Order placed ✓ +" + beans + " beans");
  } catch (e) { toast(e.message); }
}
function listenActiveOrder() {
  unsubs.push(db.collection("orders").where("customerId", "==", auth.currentUser.uid).where("status", "in", ["Preparing", "Picked Up", "Arriving"])
    .onSnapshot(snap => {
      if (snap.empty) { $("active-order-status").innerHTML = "No active orders."; $("order-timeline").style.display = "none"; $("rider-details").style.display = "none"; activeOrderId = null; return; }
      const d = snap.docs[0]; const o = d.data(); activeOrderId = d.id;
      $("active-order-status").innerHTML = `<b>${escapeHtml(o.customerName)}</b> • ₱${peso(o.total)} (${o.paymentMethod})<br>Status: <b>${o.status}</b> • Tip ₱${peso(o.tip)}`;
      const tl = $("order-timeline"); tl.style.display = "flex";
      const order = ["Preparing", "Picked Up", "Arriving", "Delivered"];
      tl.querySelectorAll(".t-step").forEach(el => {
        const i = order.indexOf(el.dataset.s), c = order.indexOf(o.status);
        el.className = "t-step" + (i < c ? " done" : i === c ? " now" : "");
      });
      if (o.riderId) {
        $("rider-details").style.display = "block";
        $("r-name").textContent = o.riderName || "Rider";
        $("r-brand").textContent = o.riderBrand || ""; $("r-plate").textContent = o.riderPlate || "";
        $("r-photo-wrap").textContent = (o.riderName || "R").charAt(0).toUpperCase();
        if (o.riderLat && o.riderLng) {
          $("r-live").textContent = `Live: ${o.riderLat.toFixed(5)}, ${o.riderLng.toFixed(5)}`;
          $("r-maplink").href = `https://maps.google.com/?q=${o.riderLat},${o.riderLng}`;
          $("r-eta").textContent = "🛵 Rider is on the way — ETA ~10–20 min (demo).";
        } else { $("r-live").textContent = "Rider accepted — starting GPS…"; $("r-eta").textContent = ""; }
      } else $("rider-details").style.display = "none";
    }));
}
function listenHistory() {
  unsubs.push(db.collection("orders").where("customerId", "==", auth.currentUser.uid).orderBy("timestamp", "desc").limit(10)
    .onSnapshot(s => {
      $("order-history").innerHTML = `<table><thead><tr><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>` +
        s.docs.map(d => { const o = d.data(); return `<tr><td>${o.timestamp ? o.timestamp.toDate().toLocaleString() : "…"}</td><td>${(o.items || []).map(i => escapeHtml(i.name)).join(", ")}</td><td>₱${peso(o.total)}</td><td>${o.status}</td></tr>`; }).join("") + `</tbody></table>`;
    }, () => {}));
}
async function confirmDelivered() { if (activeOrderId) { await db.collection("orders").doc(activeOrderId).update({ status: "Delivered" }); toast("Enjoy your coffee ☕"); } }

/* ---------- RESERVATIONS ---------- */
async function makeReservation() {
  if (currentUserRole !== "customer") return toast("Log in as customer to reserve.");
  const date = $("res-date").value, time = $("res-time").value;
  if (!date || !time) return toast("Pick date + time.");
  await db.collection("reservations").add({
    userId: auth.currentUser.uid, name: currentUserDoc.fname + " " + currentUserDoc.lname,
    contact: currentUserDoc.contact || "", date, time, seats: $("res-seats").value, note: $("res-note").value,
    status: "Pending", createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast("Table reserved ✓ — cashier/admin can see it."); $("res-note").value = "";
}
function listenMyReservations() {
  unsubs.push(db.collection("reservations").where("userId", "==", auth.currentUser.uid).orderBy("createdAt", "desc").limit(10)
    .onSnapshot(s => { $("res-list-cust").innerHTML = "<h4>My reservations</h4>" + (s.docs.map(d => { const r = d.data(); return `<p>📅 ${r.date} ${r.time} • ${r.seats} seats • <b>${r.status}</b></p>`; }).join("") || "<p>None yet.</p>"); }, () => {}));
}
function listenReservationsStaff() {
  unsubs.push(db.collection("reservations").orderBy("createdAt", "desc").limit(20).onSnapshot(s => {
    const html = s.docs.map(d => { const r = d.data(); return `<p>📅 ${r.date} ${r.time} • ${escapeHtml(r.name)} • ${r.seats} seats • <b>${r.status}</b> <button class="btn btn-sm btn-secondary" onclick="setRes('${d.id}','Confirmed')">✓</button> <button class="btn btn-sm btn-ghost" onclick="setRes('${d.id}','Cancelled')">✕</button></p>`; }).join("") || "<p>No reservations.</p>";
    if ($("res-list-staff")) $("res-list-staff").innerHTML = html;
  }));
}
async function setRes(id, st) { await db.collection("reservations").doc(id).update({ status: st }); }

/* ---------- CASHIER ---------- */
function listenOnlineOrders() {
  unsubs.push(db.collection("orders").where("status", "in", ["Preparing", "Picked Up", "Arriving"]).orderBy("timestamp", "desc").limit(15)
    .onSnapshot(s => {
      $("online-orders-list").innerHTML = s.docs.map(d => { const o = d.data(); return `<div class="mapbox" style="margin-bottom:8px"><b>${escapeHtml(o.customerName)}</b> • ₱${peso(o.total)} • ${o.status}<br><small>${escapeHtml(o.address || "")} • ${(o.items || []).map(i => escapeHtml(i.name)).join(", ")}</small><br><button class="btn btn-sm btn-primary" style="margin-top:6px" onclick="printOnline('${d.id}')">🖨 Print ×2</button></div>`; }).join("") || "<p>No online orders.</p>";
    }, () => { $("online-orders-list").innerHTML = "<p>Need Firestore index (status+timestamp). Walk-in POS still works.</p>"; }));
}
async function printOnline(id) {
  const d = await db.collection("orders").doc(id).get(); const o = d.data();
  openReceipt("ONLINE-" + id.slice(0, 6).toUpperCase(), o.items || [], o.subtotal || o.total, o.tip || 0, o.total, o.customerName, currentUserDoc.fname || "Cashier", o.paymentMethod);
}
async function processPOS() {
  if (!posCart.length) return toast("No items punched.");
  const sub = posCart.reduce((s, i) => s + parseFloat(i.price), 0);
  const cname = $("pos-customer-name").value || "Walk-in";
  const pay = $("pos-payment").value;
  const oid = "POS-" + Math.floor(1000 + Math.random() * 9000);
  try {
    await db.collection("punches").add({ cashierId: auth.currentUser.uid, cashierName: currentUserDoc.fname + " " + currentUserDoc.lname, items: posCart, total: sub, payment: pay, customerName: cname, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    for (const i of posCart) { const p = productsCache.find(x => x.id === i.id); if (p) db.collection("products").doc(i.id).update({ stock: Math.max(0, (p.stock || 1) - 1) }); }
    openReceipt(oid, posCart, sub, 0, sub, cname, currentUserDoc.fname || "Cashier", pay);
    posCart = []; renderPOS(); $("pos-customer-name").value = ""; calcToday();
  } catch (e) { toast(e.message); }
}
function openReceipt(order_id, items, subtotal, tip, total, customer, cashier, payment) {
  const beans = Math.floor(parseFloat(total) / 50);
  const q = new URLSearchParams({ order_id, total: peso(total), subtotal: peso(subtotal), tip: peso(tip), beans, customer, cashier, payment, items_json: JSON.stringify(items) });
  window.open("/receipt?" + q.toString(), "_blank");
}
function listenPunches(who) {
  let q = db.collection("punches").orderBy("timestamp", "desc").limit(15);
  if (who === "cashier") q = db.collection("punches").where("cashierId", "==", auth.currentUser.uid).orderBy("timestamp", "desc").limit(15);
  unsubs.push(q.onSnapshot(s => {
    const html = `<table><thead><tr><th>When</th><th>Customer</th><th>Items</th><th>Total</th></tr></thead><tbody>` + s.docs.map(d => { const p = d.data(); return `<tr><td>${p.timestamp ? p.timestamp.toDate().toLocaleString() : "…"}</td><td>${escapeHtml(p.customerName || "")}</td><td>${(p.items || []).map(i => escapeHtml(i.name)).join(", ")}</td><td>₱${peso(p.total)}</td></tr>`; }).join("") + `</tbody></table>`;
    if (who === "cashier" && $("cashier-punches-log")) $("cashier-punches-log").innerHTML = html;
    if (who === "admin" && $("punches-log-admin")) $("punches-log-admin").innerHTML = html;
  }, () => {}));
}
async function calcToday() {
  try {
    const s = await db.collection("punches").where("cashierId", "==", auth.currentUser.uid).get();
    let t = 0; const today = new Date().toDateString();
    s.docs.forEach(d => { const p = d.data(); if (p.timestamp && p.timestamp.toDate().toDateString() === today) t += parseFloat(p.total || 0); });
    $("sales-today").textContent = peso(t);
  } catch (e) {}
}

/* ---------- ADMIN ---------- */
function listenAdmin() {
  unsubs.push(db.collection("products").onSnapshot(() => renderAdminInv()));
  unsubs.push(db.collection("orders").onSnapshot(s => {
    let rev = 0; const rows = [];
    s.docs.forEach(d => { const o = d.data(); rev += parseFloat(o.total || 0); rows.push({ id: d.id, ...o }); });
    $("stat-revenue").textContent = peso(rev); $("stat-orders").textContent = s.size;
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    $("sales-body").innerHTML = rows.slice(0, 20).map(o => `<tr><td>${o.id.slice(0, 6)}</td><td>₱${peso(o.total)}</td><td>${o.paymentMethod || ""}</td><td>${o.status || ""}</td></tr>`).join("");
    const low = productsCache.filter(p => p.stock < 10);
    $("stat-low").textContent = low.length;
  }));
  unsubs.push(db.collection("reports").onSnapshot(s => {
    $("stat-reports").textContent = s.size;
    $("reports-list").innerHTML = s.docs.map(d => { const r = d.data(); return `<div class="mapbox" style="margin-bottom:8px"><b>[${r.type}]</b> by ${escapeHtml(r.byName || "")} (${r.byRole || ""})<br>${escapeHtml(r.text || "")}<br><small>${r.createdAt ? r.createdAt.toDate().toLocaleString() : ""} • order ${r.orderId || "-"}</small> <button class="btn btn-sm btn-secondary" onclick="resolveReport('${d.id}')">Resolve</button></div>`; }).join("") || "<p>No reports. 🎉</p>";
  }));
  listenPunches("admin"); listenReservationsAdmin();
}
function renderAdminInv() {
  if (!$("admin-inventory-list")) return;
  $("admin-inventory-list").innerHTML = productsCache.map(p => `<p>☕ <b>${escapeHtml(p.name)}</b> — ₱${peso(p.price)} • stock <b>${p.stock}</b>
    <button class="btn btn-sm btn-secondary" onclick="bumpStock('${p.id}',1)">+1</button>
    <button class="btn btn-sm btn-ghost" onclick="bumpStock('${p.id}',-1)">−1</button>
    <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Del</button></p>`).join("") || "<p>No products — seed demo menu.</p>";
  $("low-stock-list").innerHTML = productsCache.filter(p => p.stock < 10).map(p => `<li>${escapeHtml(p.name)} — ${p.stock} left ⚠️</li>`).join("") || "<li>All stock optimal. ✅</li>";
  $("high-stock-list").innerHTML = productsCache.filter(p => p.stock >= 50).map(p => `<li>${escapeHtml(p.name)} — ${p.stock} 🏆 best-seller stock</li>`).join("") || "<li>No overstock.</li>";
}
async function bumpStock(id, d) { const p = productsCache.find(x => x.id === id); await db.collection("products").doc(id).update({ stock: Math.max(0, (p.stock || 0) + d) }); }
async function addProduct() {
  const n = $("new-prod-name").value.trim(), pr = parseFloat($("new-prod-price").value), st = parseInt($("new-prod-stock").value);
  if (!n || isNaN(pr) || isNaN(st)) return toast("Name + price + stock required.");
  await db.collection("products").add({ name: n, price: pr, stock: st, cat: $("new-prod-cat").value, desc: $("new-prod-desc").value || "" });
  $("new-prod-name").value = ""; $("new-prod-price").value = ""; $("new-prod-stock").value = ""; $("new-prod-desc").value = "";
  toast("Product added ✓");
}
async function deleteProduct(id) { if (confirm("Delete product?")) await db.collection("products").doc(id).delete(); }
async function seedMenu() { for (const m of DEMO_MENU) await db.collection("products").add(m); toast("Demo menu seeded 🌱"); }
function exportCSV() {
  db.collection("orders").get().then(s => {
    let csv = "id,customer,total,payment,status,tip\n";
    s.docs.forEach(d => { const o = d.data(); csv += `${d.id},"${(o.customerName || "").replace(/"/g, "")}",${o.total},${o.paymentMethod},${o.status},${o.tip || 0}\n`; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "takape-sales.csv"; a.click();
  });
}
async function resolveReport(id) { await db.collection("reports").doc(id).delete(); toast("Report resolved."); }
function listenReservationsAdmin() {
  unsubs.push(db.collection("reservations").orderBy("createdAt", "desc").limit(20).onSnapshot(s => {
    if ($("res-list-admin")) $("res-list-admin").innerHTML = s.docs.map(d => { const r = d.data(); return `<p>📅 ${r.date} ${r.time} • ${escapeHtml(r.name)} • ${r.seats} • <b>${r.status}</b> <button class="btn btn-sm btn-secondary" onclick="setRes('${d.id}','Confirmed')">✓</button> <button class="btn btn-sm btn-ghost" onclick="setRes('${d.id}','Cancelled')">✕</button></p>`; }).join("") || "<p>None.</p>";
  }, () => {}));
}

/* ---------- RIDER ---------- */
function loadRiderProfile() {
  $("rp-name").textContent = (currentUserDoc.fname || "") + " " + (currentUserDoc.lname || "");
  $("rp-plate").textContent = currentUserDoc.plate || ""; $("rp-brand").textContent = currentUserDoc.brand || "";
  $("rp-contact").textContent = currentUserDoc.contact || "";
  if (currentUserDoc.face) { $("rp-photo-wrap").innerHTML = `<img src="${currentUserDoc.face}" alt="rider">`; }
  listenAvailable(); listenMyDelivery();
}
function listenAvailable() {
  unsubs.push(db.collection("orders").where("status", "==", "Preparing").onSnapshot(s => {
    const avail = s.docs.filter(d => !d.data().riderId);
    if ($("available-orders-list")) $("available-orders-list").innerHTML = avail.map(d => { const o = d.data(); return `<div class="mapbox" style="margin-bottom:8px">📦 To: <b>${escapeHtml(o.address || "")}</b><br>${(o.items || []).map(i => escapeHtml(i.name)).join(", ")} • ₱${peso(o.total)} (tip ₱${peso(o.tip)})<br><button class="btn btn-sm btn-primary" style="margin-top:6px" onclick="acceptOrder('${d.id}')">Accept 🛵</button></div>`; }).join("") || "<p>No available orders.</p>";
  }));
}
function listenMyDelivery() {
  unsubs.push(db.collection("orders").where("riderId", "==", auth.currentUser.uid).where("status", "in", ["Picked Up", "Arriving"]).onSnapshot(s => {
    if (!s.empty) {
      const d = s.docs[0]; riderOrderId = d.id; const o = d.data();
      $("rider-active-delivery").innerHTML = `<b>📍 ${escapeHtml(o.address || "")}</b><br>${escapeHtml(o.customerName || "")} • ${escapeHtml(o.contact || "")} • ₱${peso(o.total)}<br>Status: <b>${o.status}</b>`;
      $("rider-controls").style.display = "block";
      $("rider-navlink").href = `https://maps.google.com/?q=${encodeURIComponent(o.address || "")}`;
    } else if (!riderOrderId) { $("rider-active-delivery").textContent = "No active delivery."; $("rider-controls").style.display = "none"; }
  }));
}
async function acceptOrder(id) {
  riderOrderId = id;
  await db.collection("orders").doc(id).update({ status: "Picked Up", riderId: auth.currentUser.uid, riderName: currentUserDoc.fname + " " + currentUserDoc.lname, riderPlate: currentUserDoc.plate || "", riderBrand: currentUserDoc.brand || "" });
  $("rider-active-delivery").textContent = "Delivery in progress… share your live location!"; $("rider-controls").style.display = "block";
  toast("Order accepted 🛵 — now share live location.");
}
async function updateOrderStatus(st) {
  if (!riderOrderId) return toast("Accept an order first.");
  await db.collection("orders").doc(riderOrderId).update({ status: st });
  if (st === "Delivered") { riderOrderId = null; stopShare(); $("rider-active-delivery").textContent = "Delivered ✅ — waiting for next booking."; $("rider-controls").style.display = "none"; }
  else toast("Status → " + st);
}
function toggleShare() {
  if (!riderOrderId) return toast("Accept an order before sharing GPS.");
  if (sharing) return stopShare();
  if (!navigator.geolocation) return toast("GPS not supported on this device.");
  sharing = true; $("btn-share").textContent = "⏹ Stop sharing";
  watchId = navigator.geolocation.watchPosition(async pos => {
    const { latitude: la, longitude: ln } = pos.coords;
    try {
      await db.collection("orders").doc(riderOrderId).update({ riderLat: la, riderLng: ln });
      await db.collection("users").doc(auth.currentUser.uid).update({ lat: la, lng: ln, lastShare: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) {}
  }, () => toast("Allow location access to share GPS."), { enableHighAccuracy: true });
  toast("📡 Live location ON — customer can see you.");
}
function stopShare() { sharing = false; if (watchId) navigator.geolocation.clearWatch(watchId); watchId = null; const b = $("btn-share"); if (b) b.textContent = "📡 Start sharing live location"; }

/* ---------- REPORTS ---------- */
function openReport(kind) {
  reportTarget = kind;
  $("modal-title").textContent = kind === "fake" ? "Report fake booking" : "Report rider violation";
  $("modal-sub").textContent = kind === "fake" ? "Riders: fake address / prank order / unreachable customer." : "Customers: reckless riding, rude behavior, overcharging.";
  $("modal-text").value = ""; $("modal-bg").classList.add("open");
}
function closeReport() { $("modal-bg").classList.remove("open"); }
async function submitReport() {
  const text = $("modal-text").value.trim(); if (!text) return toast("Describe what happened.");
  await db.collection("reports").add({
    type: reportTarget === "fake" ? "fake_booking" : "rider_violation",
    byUid: auth.currentUser ? auth.currentUser.uid : "guest",
    byName: currentUserDoc ? (currentUserDoc.fname + " " + currentUserDoc.lname) : "guest",
    byRole: currentUserRole, orderId: activeOrderId || riderOrderId || "",
    text, status: "Open", createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  closeReport(); toast("Report filed to admin 🚨");
}
function reportRider() { openReport("rider"); }
function reportFakeBooking() { openReport("fake"); }

loadProducts();
