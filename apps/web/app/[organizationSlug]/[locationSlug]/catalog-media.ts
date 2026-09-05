import type { PublicBookingCatalogV2 } from '@barber-saas/api-client';

function proxyMediaUrl(url: string | null, proxyBaseUrl: string) {
  if (!url?.startsWith('/v2/public/')) return url;
  return `${proxyBaseUrl.replace(/\/$/u, '')}${url}`;
}

export function proxyCatalogMediaUrls(
  catalog: PublicBookingCatalogV2,
  proxyBaseUrl: string,
): PublicBookingCatalogV2 {
  return {
    ...catalog,
    organization: {
      ...catalog.organization,
      coverImageUrl: proxyMediaUrl(
        catalog.organization.coverImageUrl,
        proxyBaseUrl,
      ),
      profilePhotoUrl: proxyMediaUrl(
        catalog.organization.profilePhotoUrl,
        proxyBaseUrl,
      ),
    },
    professionals: catalog.professionals.map((professional) => ({
      ...professional,
      photoUrl: proxyMediaUrl(professional.photoUrl, proxyBaseUrl),
    })),
    products: catalog.products.map((product) => ({
      ...product,
      imageUrl: proxyMediaUrl(product.imageUrl, proxyBaseUrl),
    })),
    services: catalog.services.map((service) => ({
      ...service,
      imageUrl: proxyMediaUrl(service.imageUrl, proxyBaseUrl),
    })),
  };
}
