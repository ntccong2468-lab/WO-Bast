export type SellerId='seller-a'|'seller-b';
export type Category='system'|'image'|'quality';
export interface PromptInput{name:string;nameRu:string;description:string;category:Category;body:string;tags:string[];group:string;mode:string}
export interface Prompt extends PromptInput{id:string;systemPromptId:string|null;source:'system'|'seller';version:number;updatedAt:string;isFavorite:boolean;lastUsedAt:string|null}
export interface PromptVersion{version:number;snapshot:PromptInput;editedBy:SellerId;createdAt:string}
export interface Bridge{
 session():Promise<{seller:SellerId}>;switchSeller(seller:SellerId):Promise<void>;
 list():Promise<Prompt[]>;get(id:string):Promise<Prompt>;create(input:PromptInput):Promise<Prompt>;save(id:string,input:PromptInput):Promise<Prompt>;clone(id:string):Promise<Prompt>;remove(id:string):Promise<void>;
 versions(id:string):Promise<PromptVersion[]>;restore(id:string,version:number):Promise<Prompt>;reset(id:string):Promise<Prompt>;favorite(id:string,value:boolean):Promise<void>;setDefault(mode:string,id:string):Promise<void>;defaults():Promise<Record<string,string>>;markUsed(id:string):Promise<void>;
 importJson(json:string):Promise<Prompt[]>;exportJson(ids:string[]):Promise<string>;setDirty(dirty:boolean):Promise<void>;
}
declare global{interface Window{vnPochta:Bridge}}
