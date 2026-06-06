import type { BrowserPool } from "./contract.js";
import { ConnectorBrowserUnavailableError } from "./errors.js";

export interface BrowserPageLease<Page = unknown> {
  readonly page: Page;
  close(): Promise<void> | void;
}

export type BrowserPageFactory<Page = unknown> = () => Promise<
  BrowserPageLease<Page>
>;

export class SimpleBrowserPool<Page = unknown> implements BrowserPool {
  constructor(private readonly createPage: BrowserPageFactory<Page>) {}

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const lease = await this.createPage();
    try {
      return await fn(lease.page);
    } finally {
      await lease.close();
    }
  }
}

export class UnavailableBrowserPool implements BrowserPool {
  constructor(private readonly detail = "Browser pool is not configured") {}

  async withPage<T>(_fn: (page: unknown) => Promise<T>): Promise<T> {
    throw new ConnectorBrowserUnavailableError(this.detail);
  }
}
