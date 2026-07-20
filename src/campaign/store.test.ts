import { beforeEach, describe, expect, it, vi } from "vitest";
import { Campaign } from "./campaign";
import { CampaignStore } from "./store";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number { return this.entries.size; }
  public clear(): void { this.entries.clear(); }
  public getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  public key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  public removeItem(key: string): void { this.entries.delete(key); }
  public setItem(key: string, value: string): void { this.entries.set(key, value); }
}

class BlockedStorage implements Storage {
  public get length(): number { throw new DOMException("Storage blocked", "SecurityError"); }
  public clear(): void { throw new DOMException("Storage blocked", "SecurityError"); }
  public getItem(): string | null { throw new DOMException("Storage blocked", "SecurityError"); }
  public key(): string | null { throw new DOMException("Storage blocked", "SecurityError"); }
  public removeItem(): void { throw new DOMException("Storage blocked", "SecurityError"); }
  public setItem(): void { throw new DOMException("Storage blocked", "SecurityError"); }
}

describe("CampaignStore save isolation", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("keeps a demo campaign separate from the ordinary campaign", () => {
    const ordinaryStore = new CampaignStore();
    const demoStore = new CampaignStore("zgp-commander-build-week-demo-v1");
    const ordinary = new Campaign();
    ordinary.endDay();

    ordinaryStore.save(ordinary);

    expect(ordinaryStore.load().state.day).toBe(2);
    expect(demoStore.load().state.day).toBe(1);
  });

  it("resets only the selected campaign slot", () => {
    const ordinaryStore = new CampaignStore();
    const demoStore = new CampaignStore("zgp-commander-build-week-demo-v1");
    const ordinary = new Campaign();
    const demo = new Campaign();
    ordinary.endDay();
    demo.endDay();
    ordinaryStore.save(ordinary);
    demoStore.save(demo);

    demoStore.reset();

    expect(demoStore.load().state.day).toBe(1);
    expect(ordinaryStore.load().state.day).toBe(2);
  });

  it("continues with an in-memory campaign when browser storage is blocked", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new BlockedStorage(),
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new CampaignStore("blocked");

    expect(() => store.save(new Campaign())).not.toThrow();
    expect(store.reset().state.day).toBe(1);
    expect(store.load().state.day).toBe(1);
    expect(warning).toHaveBeenCalledTimes(3);
    warning.mockRestore();
  });
});
