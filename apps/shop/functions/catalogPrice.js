// The unit price the shop charges for one catalog line. Mirrors catalogUnitPrice in
// src/app/CartContext.tsx: an edition's own price (an edition with no price is not for
// sale), else the sale price only while the sale is on (a positive price, inside its
// optional start/end dates), else the retail price.
// NaN means "no usable price": callers refuse the line instead of charging $0.
const { saleActive } = require("./shared/promotions");

function catalogUnitPrice(book, variant, now = new Date()) {
  if (variant) {
    const own = variant.price;
    return own === undefined || own === null || own === "" ? NaN : Number(own);
  }
  return saleActive(book, now) ? Number(book.salePrice) : Number(book && book.retailPrice);
}

module.exports = { catalogUnitPrice };
