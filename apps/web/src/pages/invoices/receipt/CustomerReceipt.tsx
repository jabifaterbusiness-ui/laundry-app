import type { CustomerReceipt as CustomerReceiptData } from "../../../lib/invoices-api.js";
import type { BusinessBranding } from "../../../lib/businesses-api.js";
import {
  formatReceiptDate,
  formatReceiptMoney,
  getBusinessInitials,
} from "./receipt-utils.js";
import "./ReceiptStyles.css";

interface CustomerReceiptProps {
  receipt: CustomerReceiptData;
  branding?: BusinessBranding | null;
}

export function CustomerReceipt({
  receipt,
  branding,
}: CustomerReceiptProps) {
  const style = {
    "--receipt-primary": branding?.receiptPrimaryColor ?? "#111111",
    "--receipt-accent": branding?.receiptAccentColor ?? "#111111",
    "--receipt-background": branding?.receiptBackgroundColor ?? "#ffffff",
    "--receipt-text": branding?.receiptTextColor ?? "#111111",
  } as React.CSSProperties;
  return (
    <article className="receipt receipt--customer" style={style}>
      <header className="receipt__header">
        {branding?.logoUrl ? (
          <img
            className="receipt__logo"
            src={branding.logoUrl}
            alt={`${receipt.companyName} logo`}
          />
        ) : (
          <div className="receipt__brand-mark" aria-hidden="true">
            {getBusinessInitials(receipt.companyName)}
          </div>
        )}

        <div className="receipt__company">
          <h1>{receipt.companyName}</h1>

          <div className="receipt__company-contact">
            {receipt.companyPhone && <span>{receipt.companyPhone}</span>}
            {receipt.companyEmail && <span>{receipt.companyEmail}</span>}
            {receipt.companyWebsite && <span>{receipt.companyWebsite}</span>}
            {receipt.companyAddress && <span>{receipt.companyAddress}</span>}
          </div>
        </div>
      </header>

      <div className="receipt__title-row">
        <div>
          <h2>LAUNDRY RECEIPT</h2>
          <p>Invoice #{receipt.invoiceNumber}</p>
        </div>

        <div className="receipt__date">
          {formatReceiptDate(receipt.createdAt)}
        </div>
      </div>

      {receipt.totalAmount > 0 && receipt.balanceDue <= 0 && (
        <div className="receipt__paid-in-full" role="status" aria-label="Paid in full">
          PAID IN FULL
        </div>
      )}

      <section className="receipt__customer">
        <div>
          <span className="receipt__label">CUSTOMER</span>
          <strong>{receipt.customerName}</strong>
        </div>

        <div>
          <span className="receipt__label">ORDER</span>
          <strong>{receipt.orderNumber}</strong>
        </div>

        <div>
          <span className="receipt__label">BRANCH</span>
          <strong>{receipt.branchName}</strong>
        </div>
      </section>

      <table className="receipt__items">
        <thead>
          <tr>
            <th>QTY</th>
            <th>ITEM / COLORS</th>
            <th>RATE / PC</th>
            <th>AMOUNT</th>
          </tr>
        </thead>

        <tbody>
          {receipt.items.map((item) => {
            const piecesPerUnit =
              item.quantity > 0 && item.totalPieces > 0
                ? item.totalPieces / item.quantity
                : 1;
            const ratePerPiece = item.unitPrice / piecesPerUnit;

            return (
              <tr key={item.id}>
                <td>{item.quantity}</td>
                <td>
                  <strong className="receipt__item-name">
                    {item.itemName}
                  </strong>
                  {(item.colors ?? []).length > 0 && (
                    <span className="receipt__colors">
                      {(item.colors ?? []).join(", ")}
                    </span>
                  )}
                </td>
                <td>{formatReceiptMoney(ratePerPiece)}</td>
                <td>
                  {formatReceiptMoney(item.totalPieces * ratePerPiece)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {receipt.garmentNote && (
        <section className="receipt__note">
          <span className="receipt__label">GARMENT / CUSTOMER NOTE</span>
          <p>{receipt.garmentNote}</p>
        </section>
      )}

      {((receipt.adjustmentTotal ?? 0) !== 0 || (receipt.additiveTaxTotal ?? 0) !== 0 || (receipt.withholdingTaxTotal ?? 0) !== 0 || (receipt.appliedAdjustments?.length ?? 0) > 0 || (receipt.appliedTaxes?.length ?? 0) > 0) && (
        <section className="receipt__charges" aria-label="Invoice adjustments and taxes">
          <div><span>Service subtotal</span><strong>{formatReceiptMoney(receipt.subtotal ?? receipt.totalAmount)}</strong></div>
          {(receipt.appliedAdjustments ?? []).map((adjustment) => (
            <div key={adjustment.id}>
              <span>{adjustment.name} ({adjustment.percentage > 0 ? "+" : ""}{adjustment.percentage}%)</span>
              <strong>{adjustment.amount > 0 ? "+" : adjustment.amount < 0 ? "−" : ""}{formatReceiptMoney(Math.abs(adjustment.amount))}</strong>
            </div>
          ))}
          <div><span>Adjusted taxable amount</span><strong>{formatReceiptMoney(receipt.adjustedSubtotal ?? receipt.subtotal ?? receipt.totalAmount)}</strong></div>
          {(receipt.appliedTaxes ?? []).map((tax) => (
            <div key={tax.id}>
              <span>{tax.name} ({tax.kind === "PERCENTAGE" ? `${tax.value}%` : "Fixed"})</span>
              <strong>{tax.treatment === "WITHHOLDING" ? "−" : "+"}{formatReceiptMoney(tax.amount)}</strong>
            </div>
          ))}
        </section>
      )}

      <div className="receipt__summary">
        <div>
          <span>TOTAL PCS</span>
          <strong>
            {receipt.items.reduce((total, item) => total + item.totalPieces, 0)}
          </strong>
        </div>

        <div className="receipt__total">
          <span>TOTAL AMOUNT</span>
          <strong>{formatReceiptMoney(receipt.totalAmount)}</strong>
        </div>
      </div>

      <section className="receipt__payments">
        <h3>PAYMENT HISTORY</h3>
        {receipt.payments.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>DATE</th>
                <th>METHOD</th>
                <th>REFERENCE</th>
                <th>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {receipt.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatReceiptDate(payment.createdAt)}</td>
                  <td>{payment.type === "REFUND" ? "REFUND" : ({
                    CASH: "Cash",
                    TRANSFER: "Bank transfer",
                    POS: "POS",
                    PAY_FROM_ACCOUNT: "Customer account",
                  } as const)[payment.method]}</td>
                  <td>{payment.reference || "—"}</td>
                  <td>{payment.type === "REFUND" ? "−" : ""}{formatReceiptMoney(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No payments recorded.</p>
        )}
        <div className="receipt__payment-totals">
          <div><span>TOTAL AMOUNT</span><strong>{formatReceiptMoney(receipt.totalAmount)}</strong></div>
          <div><span>AMOUNT PAID</span><strong>{formatReceiptMoney(receipt.totalPaid)}</strong></div>
          <div><span>BALANCE DUE</span><strong>{formatReceiptMoney(receipt.balanceDue)}</strong></div>
        </div>
      </section>

      <section className="receipt__agreement">
        <span className="receipt__label">CUSTOMER AGREEMENT</span>
        <p>{receipt.customerAgreement}</p>
      </section>

      <footer className="receipt__footer">
        <strong>Thank you for choosing us.</strong>
        <span>Please keep this receipt for your records.</span>
      </footer>
    </article>
  );
}
