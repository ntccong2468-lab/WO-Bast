import type { SellerId } from '../shared/contracts';
export class Session {
  seller: SellerId = 'seller-a';
  dirty = false;
  switch(seller: SellerId) {
    if (seller !== 'seller-a' && seller !== 'seller-b') throw new Error('Seller không hợp lệ');
    this.seller = seller;
    this.dirty = false;
  }
}
