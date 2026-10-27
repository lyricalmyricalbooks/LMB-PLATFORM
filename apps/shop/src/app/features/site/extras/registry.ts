// Every storefront extra's feature.ts (see featureKit.ts), in folder-name order so the lists never depend on file order,
// except that a feature placed after another feature's entry comes after it (orderFeatures).
import { orderFeatures, type StorefrontFeature } from "./featureKit";

const files = import.meta.glob<StorefrontFeature>("./*/feature.ts", { eager: true, import: "default" });

export const STOREFRONT_FEATURES: StorefrontFeature[] = orderFeatures(Object.keys(files).sort().map(path => files[path]));
