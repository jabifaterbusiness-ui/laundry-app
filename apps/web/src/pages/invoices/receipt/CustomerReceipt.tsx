import type { Invoice } from "@laundry-app/shared";
import {
  formatReceiptDate,
  formatReceiptMoney,
  getBusinessInitials,
  getReceiptTitle,
} from "./receipt-utils.js";
import "./ReceiptStyles.css";

interface CustomerReceiptProps {
  invoice: Invoice;
}

export function CustomerReceipt({ invoice }: CustomerReceiptProps) {
  return (
    <article className="receipt receipt--customer">
      <header className="receipt__header">
        <div className="receipt__brand-mark" aria-hidden="true">
          {getBusinessInitials(invoice.companyName)}
        </div>

        <div className="receipt__company">
          <h1>{invoice.companyName}</h1>

          <div className="receipt__company-contact">
            {invoice.companyPhone && <span>{invoice.companyPhone}</span>}
            {invoice.companyEmail && <span>{invoice.companyEmail}</span>}
            {invoice.companyWebsite && <span>{invoice.companyWebsite}</span>}
            {invoice.companyAddress && <span>{invoice.companyAddress}</span>}
          </div>
        </div>
      </header>

      <div className="receipt__title-row">
        <div>
          <h2>{getReceiptTitle(invoice)}</h2>
          <p>Invoice #{invoice.invoiceNumber}</p>
        </div>

        <div className="receipt__date">
          {formatReceiptDate(invoice.createdAt)}
        </div>
      </div>

      <section className="receipt__customer">
        <div>
          <span className="receipt__label">CUSTOMER</span>
          <strong>{invoice.customerName}</strong>
        </div>

        <div>
          <span className="receipt__label">ORDER</span>
          <strong>{invoice.invoiceNumber}</strong>
        </div>

        <div>
          <span className="receipt__label">BRANCH</span>
          <strong>{invoice.order.branch.name}</strong>
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
          {invoice.items.map((item) => (
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

      {invoice.garmentNote && (
        <section className="receipt__note">
          <span className="receipt__label">GARMENT / CUSTOMER NOTE</span>
          <p>{invoice.garmentNote}</p>
        </section>
      )}

      <div className="receipt__total">
        <span>TOTAL AMOUNT</span>
        <strong>{formatReceiptMoney(invoice.totalAmount)}</strong>
      </div>

      <section className="receipt__agreement">
        <span className="receipt__label">CUSTOMER AGREEMENT</span>
        <p>{invoice.customerAgreement}</p>
      </section>

      <footer className="receipt__footer">
        <strong>Thank you for choosing us.</strong>
        <span>Please keep this receipt for your records.</span>
      </footer>
    </article>
  );
}
