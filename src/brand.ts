export type BrandConfig = {
  productName: string;
  cliDisplayName: string;
};

export function loadBrandConfig(): BrandConfig {
  return {
    productName: process.env.TEKASSURE_BRAND_PRODUCT_NAME || "TekAssure",
    cliDisplayName: process.env.TEKASSURE_BRAND_CLI_NAME || "tekassure",
  };
}
