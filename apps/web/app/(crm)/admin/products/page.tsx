import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllProducts } from "@/lib/data/products"
import { ProductsList } from "@/components/admin/products-list"
import {
  createProductAction,
  updateProductAction,
  deactivateProductAction,
} from "./actions"

export default async function AdminProductsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const products = await getAllProducts(ctx)

  return (
    <ProductsList
      products={products}
      createAction={createProductAction}
      updateAction={updateProductAction}
      deactivateAction={deactivateProductAction}
    />
  )
}
