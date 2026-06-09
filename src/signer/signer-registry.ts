export interface ISigner {
  readonly name: string;
  sign(params: Record<string, unknown>): Promise<Record<string, string>>;
}

class SignerRegistryImpl {
  private signers = new Map<string, ISigner>();
  private aliases = new Map<string, string>();

  register(signer: ISigner, ...aliases: string[]): void {
    this.signers.set(signer.name, signer);
    for (const alias of aliases) this.aliases.set(alias, signer.name);
  }

  get(nameOrAlias: string): ISigner | null {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.signers.get(name) ?? null;
  }

  list(): string[] {
    return Array.from(this.signers.keys());
  }

  resolveAlias(alias: string): string | null {
    return this.aliases.get(alias) ?? null;
  }
}

export const SignerRegistry = new SignerRegistryImpl();
