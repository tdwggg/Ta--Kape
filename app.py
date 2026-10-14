import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/receipt")
def print_receipt():
    order_id = request.args.get("order_id", "POS-0000")
    total = request.args.get("total", "0.00")
    subtotal = request.args.get("subtotal", total)
    tip = request.args.get("tip", "0.00")
    beans = request.args.get("beans", "0")
    customer = request.args.get("customer", "Walk-in")
    cashier = request.args.get("cashier", "Cashier")
    payment = request.args.get("payment", "cash")
    items_json = request.args.get("items_json", "[]")
    try:
        json.loads(items_json)
    except Exception:
        items_json = "[]"
    return render_template(
        "receipt.html",
        order_id=order_id, total=total, subtotal=subtotal, tip=tip,
        beans=beans, customer=customer, cashier=cashier,
        payment=payment, items_json=items_json,
        date=datetime.now().strftime("%Y-%m-%d %H:%M"),
    )

@app.route("/health")
def health():
    return jsonify(status="ok", app="ta-kape", time=datetime.now().isoformat())

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
