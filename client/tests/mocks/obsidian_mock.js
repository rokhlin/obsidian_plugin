export class TAbstractFile {
  constructor(path) {
    this.path = path;
    this.name = path.split("/").pop();
  }
}

export class TFile extends TAbstractFile {
  constructor(path, content = "", mtime = Date.now(), size = content.length) {
    super(path);
    this.content = content;
    this.stat = { mtime, size };
    this.extension = path.split(".").pop() || "md";
  }
}

export class TFolder extends TAbstractFile {
  constructor(path, children = []) {
    super(path);
    this.children = children;
  }
}

export class Notice {
  constructor(message, duration) {
    this.message = message;
    this.duration = duration;
  }
}

export const requestUrl = async (opts) => {
  return { status: 200, json: {} };
};
