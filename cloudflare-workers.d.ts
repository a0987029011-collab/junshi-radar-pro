declare module "cloudflare:workers" {
  // The concrete binding type is injected by the Sites/Cloudflare runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const env: Record<string, any>;
}
