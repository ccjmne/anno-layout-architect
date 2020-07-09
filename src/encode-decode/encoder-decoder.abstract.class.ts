import { encode, decode } from 'src/utils/base62';

export abstract class EncoderDecoder<T> {

  private code: string;
  private i: number;

  public abstract get version(): number;

  public encode(data: T): string {
    return encode(this.version, 1) + this.encodeImpl(data);
  }

  public decode(code: string): T {
    this.code = code;
    this.i = 0;

    if (decode(this.consume(1)) !== this.version) {
      throw new Error(`Can't decode code '${code}' with import/export v${this.version}`);
    }

    return this.decodeImpl();
  }

  protected abstract encodeImpl(data: T): string;
  protected abstract decodeImpl(): T;

  protected over(): boolean {
    return this.i >= this.code.length;
  }

  protected consume(len: number): string {
    const res = this.code.substr(this.i, len);
    this.i += len;
    return res;
  }

}
