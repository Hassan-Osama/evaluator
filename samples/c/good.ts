class CacheStore<T> {
  private items: T[] = [];
  add(item: T): void {
    this.items.push(item);
  }
  getAll(): T[] {
    return this.items;
  }
}

const users = new CacheStore<string>();
const scores = new CacheStore<number>();
users.add("alice");
scores.add(100);
// @ts-expect-error number is not a string
users.add(42);
// @ts-expect-error string is not a number
scores.add("high");
console.log(users.getAll(), scores.getAll());
