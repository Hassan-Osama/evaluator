class CacheStore {
  items: any[] = [];
  add(item: any): void { this.items.push(item); }
  getAll(): any[] { return this.items; }
}
const users = new CacheStore();
users.add("x");
