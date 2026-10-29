import type { CompanyReceipt as CompanyReceiptData } from "../../../lib/invoices-api.js";
import type { BusinessBranding } from "../../../lib/businesses-api.js";
import {
  formatReceiptDate,
  formatReceiptMoney,
  getBusinessInitials,
} from "./receipt-utils.js";
import "./ReceiptStyles.css";

interface CompanyReceiptProps {
  receipt: CompanyReceiptData;
  branding?: BusinessBranding | null;
}

export function CompanyReceipt({
  receipt,
  branding,
}: CompanyReceiptProps) {
  const style = {
    "--receipt-primary": branding?.receiptPrimaryColor ?? "#111111",
    "--receipt-accent": branding?.receiptAccentColor ?? "#111111",
    "--receipt-background": branding?.receiptBackgroundColor ?? "#ffffff",
    "--receipt-text": branding?.receiptTextColor ?? "#111111",
  } as React.CSSProperties;
  return (
    <article className="receipt receipt--company" style={style}>
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
          <h2>LAUNDRY RECEIPT — COMPANY COPY</h2>
          <p>Invoice #{receipt.invoiceNumber}</p>
        </div>

        <div className="receipt__date">
          {formatReceiptDate(receipt.createdAt)}
        </div>
      </div>

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

      {receipt.internalNote && (
        <section className="receipt__note receipt__note--internal">
          <span className="receipt__label">PRIVATE / INTERNAL NOTE</span>
          <p>{receipt.internalNote}</p>
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
        <h3>PAYMENT HISTORY / INTERNAL RECORD</h3>
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

      <footer className="receipt__footer">
        <strong>COMPANY COPY — INTERNAL RECORD</strong>
      </footer>
    </article>
  );
}
