"use client";

import { useRouter } from "next/navigation";
import { RouteItem } from "../../discover/discovery-browser";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import styles from "./route-overview.module.css";

export default function RouteRelatedRoutes({ routes }: { routes: DiscoveryRoute[] }) {
  const router = useRouter();
  return <div className={styles.relatedGrid}>
    {routes.map((route, index) => <RouteItem
      key={route.key}
      route={route}
      index={index}
      featured
      onSelect={(selected) => router.push(selected.href)}
    />)}
  </div>;
}
