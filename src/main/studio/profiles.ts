import type { Database } from 'better-sqlite3';
import type { SellerId } from '../../shared/contracts';
import { normalizeProductSize } from '../../shared/studio-ratios';

export interface ProductProfile {
  sellerId: SellerId;
  storeId: string;
  marketplace: string;
  productSize: string;
  updatedAt: string;
}

export class ProductProfileStore {
  constructor(private db: Database) {}
  get(seller: SellerId, storeId = 'default-store', marketplace = 'all') {
    const row = this.db
      .prepare(
        'SELECT seller_id,store_id,marketplace,product_size,updated_at FROM seller_product_profiles WHERE seller_id=? AND store_id=? AND marketplace=?',
      )
      .get(seller, storeId, marketplace) as
      | {
          seller_id: SellerId;
          store_id: string;
          marketplace: string;
          product_size: string;
          updated_at: string;
        }
      | undefined;
    return row
      ? this.map(row)
      : {
          sellerId: seller,
          storeId,
          marketplace,
          productSize: '',
          updatedAt: new Date(0).toISOString(),
        };
  }
  save(seller: SellerId, productSize: string, storeId = 'default-store', marketplace = 'all') {
    const value = productSize.trim() ? normalizeProductSize(productSize) : '';
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO seller_product_profiles(seller_id,store_id,marketplace,product_size,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(seller_id,store_id,marketplace) DO UPDATE SET product_size=excluded.product_size,updated_at=excluded.updated_at`,
      )
      .run(seller, storeId, marketplace, value, updatedAt);
    return this.get(seller, storeId, marketplace);
  }
  private map(row: {
    seller_id: SellerId;
    store_id: string;
    marketplace: string;
    product_size: string;
    updated_at: string;
  }): ProductProfile {
    return {
      sellerId: row.seller_id,
      storeId: row.store_id,
      marketplace: row.marketplace,
      productSize: row.product_size,
      updatedAt: row.updated_at,
    };
  }
}
