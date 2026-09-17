export type BrandConfig = {
  productName: string;
  cliDisplayName: string;
};

export function loadBrandConfig(): BrandConfig {
  return {
    productName: process.env.NOVA_BRAND_PRODUCT_NAME || "Nova",
    cliDisplayName: process.env.NOVA_BRAND_CLI_NAME || "nova",
  };
}
