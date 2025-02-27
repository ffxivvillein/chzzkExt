import log from "@log";

export const defaultConfig = {
  vodDownload: false,
  clipDownload: true,
};

type ConfigData = string | boolean | number;
type ConfigObject = {
  [key: string]: ConfigData;
};
type AnyListener = () => void;
type CoditionListener = (changedKey: string[]) => boolean;
type Listener = (key: string, newData: ConfigData) => void;

class ConfigInstance {
  public config: ConfigObject = {};
  public get<T = ConfigData>(key: string): T | undefined;
  public get<T = ConfigData>(key: string, defaultValue: T): T;
  public get<T = ConfigData>(key: string, defaultValue?: T): T {
    try {
      return (
        typeof this.config[key] == "undefined" ? defaultValue : this.config[key]
      ) as T;
    } catch (e) {
      return defaultValue as T;
    }
  }
  public set(key: string, value: ConfigData): void {
    this.config[key] = value;
    this.emit(key, value);
    this.emitAny();
  }
  public load(cfg: ConfigObject): void {
    this.config = cfg;
    this.emitAny();
  }
  public save() {
    chrome.storage.local
      .set({
        config: this.config,
      })
      .then(() => {
        log("ConfigInstance", "Saved config");
      });
  }
  public async loadFromStorage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["config"], (result) => {
        this.config = result.config || defaultConfig;
        resolve();
      });
    });
  }
  public loadAsT<T>() {
    return this.config as T;
  }

  listeners: { [key: string]: Listener[] } = {};
  public addListener(key: string, listener: Listener): void {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(listener);
  }
  public removeListener(key: string, listener: Listener): void {
    if (!this.listeners[key]) {
      return;
    }
    this.listeners[key] = this.listeners[key].filter((l) => l !== listener);
  }
  public emit(key: string, newData: ConfigData): void {
    if (!this.listeners[key]) {
      return;
    }
    this.listeners[key].forEach((l) => l(key, newData));
  }

  anyListeners: AnyListener[];
  conditionListeners: [CoditionListener, AnyListener][] = [];
  public addAnyListener(listener: AnyListener): void {
    this.anyListeners.push(listener);
  }
  public removeAnyListener(listener: AnyListener): void {
    this.anyListeners = this.anyListeners.filter((l) => l !== listener);
  }
  public addConditionListener(
    condition: CoditionListener,
    listener: AnyListener
  ): void {
    this.conditionListeners.push([condition, listener]);
  }
  public removeConditionListener(
    condition: CoditionListener,
    listener: AnyListener
  ): void {
    this.conditionListeners = this.conditionListeners.filter(
      ([c, l]) => c !== condition && l !== listener
    );
  }
  public emitAny(): void {
    this.anyListeners.forEach((l) => l());
  }
  public emitCondition(changes: string[]) {
    this.conditionListeners.forEach(([c, l]) => {
      if (c(changes)) {
        l();
      }
    });
  }

  constructor() {
    this.anyListeners = [];
    try {
      if (!chrome) return;
    } catch (e) {
      console.error(e);
      return;
    }
    if (!chrome) return;
    if (!chrome.storage) return;
    if (!chrome.storage.local) return;
    this.loadFromStorage();
    chrome.storage.onChanged.addListener((changes) => {
      for (const key in changes) {
        if (key == "config") {
          // get diff from new value and my value
          const newConfig = changes.config.newValue;
          const oldConfig = this.config;
          const diff = new Set([
            ...Object.keys(newConfig),
            ...Object.keys(oldConfig),
          ]);
          const diffs = Array.from(diff).filter(
            (key) => newConfig[key] !== oldConfig[key]
          );
          for (const key of diffs) {
            this.emit(key, newConfig[key]);
          }
          this.config = newConfig;
          this.emitAny();
          this.emitCondition(diffs);
        }
      }
    });
  }

  public syncConfig() {
    const interval = setInterval(async () => {
      const config = await fetch("chzzkext://loadconfig").then((res) =>
        res.json()
      );
      const diff = new Set([
        ...Object.keys(config),
        ...Object.keys(this.config),
      ]);
      const diffs = Array.from(diff).filter(
        (key) => config[key] !== this.config[key]
      );
      if (diffs.length == 0) return;
      this.emitCondition(diffs);

      this.load(config);
      window.chzzkExt.config = config;
      window.dispatchEvent(new Event("chzzkExtConfig"));
    }, 1000);
  }

  public syncConfigBackground(main: () => void) {
    const interval = setInterval(async () => {
      const config = await fetch("chzzkext://loadconfig").then((res) =>
        res.json()
      );
      const diff = new Set([
        ...Object.keys(config),
        ...Object.keys(this.config),
      ]);
      const diffs = Array.from(diff).filter(
        (key) => config[key] !== this.config[key]
      );
      if (diffs.length == 0) return;
      this.emitCondition(diffs);

      this.load(config);
      main();
    }, 1000);
  }
}

const configInstance = new ConfigInstance();

export default configInstance;
