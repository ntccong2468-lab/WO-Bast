import type {Database} from 'better-sqlite3';import type {SellerId} from '../../shared/contracts';import type {CredentialStatus} from '../../shared/studio-contracts';
export interface CryptoStore{available():boolean;backend():string;encrypt(text:string):Buffer;decrypt(bytes:Buffer):string}
export class CredentialStore{
 constructor(private db:Database,private crypto:CryptoStore,private env:Record<string,string|undefined>){}
 private environment(){return this.env.VN_POCHTA_OPENAI_KEY?.trim()||this.env.OPENAI_API_KEY?.trim()||''}
 private secure(){return this.crypto.available()&&this.crypto.backend()!=='basic_text'}
 private seller(s:SellerId){if(s!=='seller-a'&&s!=='seller-b')throw new Error('Seller không hợp lệ')}
 status(s:SellerId):CredentialStatus{this.seller(s);const source=this.environment()?'environment':this.db.prepare('SELECT 1 FROM app_credentials WHERE seller_id=?').get(s)?'local':'none';return {source,configured:source!=='none',canStore:this.secure()}}
 save(s:SellerId,key:string){this.seller(s);if(!this.secure())throw new Error('Không có kho mã hóa an toàn của hệ điều hành');if(typeof key!=='string'||!key.trim()||key.length>1024)throw new Error('Khóa không hợp lệ');try{const blob=this.crypto.encrypt(key.trim());this.db.prepare('INSERT INTO app_credentials VALUES(?,?) ON CONFLICT(seller_id) DO UPDATE SET encrypted=excluded.encrypted').run(s,blob)}catch{throw new Error('Không thể lưu khóa trong kho mã hóa')}}
 remove(s:SellerId){this.seller(s);this.db.prepare('DELETE FROM app_credentials WHERE seller_id=?').run(s)}
 resolve(s:SellerId){this.seller(s);const env=this.environment();if(env)return env;if(!this.secure())throw new Error('credential_unavailable');const row=this.db.prepare('SELECT encrypted FROM app_credentials WHERE seller_id=?').get(s) as {encrypted:Buffer}|undefined;if(!row)throw new Error('credential_missing');try{return this.crypto.decrypt(row.encrypted)}catch{throw new Error('credential_unavailable')}}
}
