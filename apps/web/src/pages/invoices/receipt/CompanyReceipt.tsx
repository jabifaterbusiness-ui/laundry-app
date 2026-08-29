import type { CompanyReceipt as CompanyReceiptData } from "../../../lib/invoices-api.js";
import {
  formatReceiptDate,
  formatReceiptMoney,
  getBusinessInitials,
} from "./receipt-utils.js";
import "./ReceiptStyles.css";

interface CompanyReceiptProps {
  receipt: CompanyReceiptData;
}

export function CompanyReceipt({ receipt }: CompanyReceiptProps) {
  return (
    <article className="receipt receipt--company">
      <header className="receipt__header">
        <div className="receipt__brand-mark" aria-hidden="true">
          {getBusinessInitials(receipt.companyName)}
        </div>

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
          <strong>{receipt.invoiceNumber}</strong>
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
            <th>ITEM</th>
            <th>PCS</th>
            <th>UNIT PRICE</th>
            <th>TOTAL PRICE</th>
          </tr>
        </thead>

        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id}>
              <td>{item.quantity}</td>
              <td>{item.itemName}</td>
              <td>{item.totalPieces}</td>
              <td>{formatReceiptMoney(item.unitPrice)}</td>
              <td>{formatReceiptMoney(item.totalPrice)}</td>
            </tr>
          ))}
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

      <div className="receipt__total">
        <span>TOTAL AMOUNT</span>
        <strong>{formatReceiptMoney(receipt.totalAmount)}</strong>
      </div>

      <footer className="receipt__footer">
        <strong>COMPANY COPY — INTERNAL RECORD</strong>
      </footer>
    </article>
  );
}
