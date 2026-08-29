import type { CustomerReceipt as CustomerReceiptData } from "../../../lib/invoices-api.js";
import {
  formatReceiptDate,
  formatReceiptMoney,
  getBusinessInitials,
  getReceiptTitle,
} from "./receipt-utils.js";
import "./ReceiptStyles.css";

interface CustomerReceiptProps {
  receipt: CustomerReceiptData;
}

export function CustomerReceipt({ receipt }: CustomerReceiptProps) {
  return (
    <article className="receipt receipt--customer">
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
          <h2>LAUNDRY RECEIPT</h2>
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

      <div className="receipt__total">
        <span>TOTAL AMOUNT</span>
        <strong>{formatReceiptMoney(receipt.totalAmount)}</strong>
      </div>

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
