const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function orderWith(items, coupon = '') {
  const totals = pricing.computeTotals(items, coupon);
  return {
    id: 9001,
    date: '22/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('ledger pricing uses the HSN slab and bills the ledger total', () => {
  const items = [{
    id: 1,
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }];

  const totals = pricing.computeTotals(items, '');

  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discount, 0);
  assert.equal(totals.tax, 5);
  assert.equal(totals.total, 105);
  assert.equal(totals.lines[0].gstPercent, 5);
});

test('invoice figures should match the ledger figures for the same order', () => {
  const order = orderWith([{
    id: 1,
    sku: 'GRN-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }]);

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, order.subtotal);
  assert.equal(figures.discount, order.discount);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.total, order.total);
  assert.equal(figures.cgst + figures.sgst, order.tax);
});

test('invoice uses the order line HSN slab when gstRate is absent', () => {
  const order = orderWith([{
    id: 1,
    sku: 'GRN-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }]);

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.total, 105);
  assert.equal(figures.subtotal, 100);
  assert.equal(figures.tax, 5);
  assert.equal(figures.cgst, 2.5);
  assert.equal(figures.sgst, 2.5);
  assert.equal(figures.total, 105);
  assert.equal(figures.rows[0].gstPercent, 5);
});

test('invoice applies the same coupon discount and tax order as the ledger', () => {
  const order = orderWith([{
    id: 1,
    sku: 'GRN-001',
    name: 'Rice',
    hsn: '1006',
    price: 1000,
    qty: 1
  }], 'SAVE10');

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.subtotal, 1000);
  assert.equal(order.discount, 100);
  assert.equal(order.tax, 45);
  assert.equal(order.total, 945);
  assert.equal(figures.tax, 45);
  assert.equal(figures.discount, 100);
  assert.equal(figures.total, 945);
});

test('GST reconciliation reports matching invoice and ledger totals without changing the in-memory order', () => {
  const order = orderWith([{
    id: 1,
    sku: 'GRN-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 1
  }]);
  const before = JSON.parse(JSON.stringify(order));
  const db = { orders: [order] };

  const result = reports.getGstReconciliation(db);

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].ledgerTax, 5);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].ledgerTotal, 105);
  assert.equal(result.rows[0].invoiceTotal, 105);
  assert.deepEqual(order, before);
});
