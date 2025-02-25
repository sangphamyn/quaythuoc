
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("search") || "";
  const categoryId = url.searchParams.get("category") || "";
  const pageParam = url.searchParams.get("page") || "1";
  const page = parseInt(pageParam, 10);
  const limit = 10;
  const skip = (page - 1) * limit;

  // Build the where clause for product search
  const where: any = {
    OR: [
      { name: { contains: searchTerm } },
      { code: { contains: searchTerm } },
    ],
  };

  // Add category filter if selected
  if (categoryId && !isNaN(Number(categoryId))) {
    where.categoryId = Number(categoryId);
  }

  const [products, totalCount, categories] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        category: true,
        compartment: {
          include: {
            row: {
              include: {
                cabinet: true,
              },
            },
          },
        },
        usageRoute: true,
        productUnits: {
          where: {
            isBaseUnit: true,
          },
          include: {
            unit: true,
          },
          take: 1,
        },
        inventoryItems: {
          include: {
            productUnit: {
              include: {
                unit: true,
              },
            },
          },
        },
      },
      skip,
      take: limit,
    }),
    db.product.count({ where }),
    db.category.findMany({
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return json({
    products,
    pagination: {
      page,
      totalPages,
      totalCount,
    },
    categories,
    searchTerm,
    categoryId,
  });
};

export default function Products() {
  const { products, pagination, categories, searchTerm, categoryId } = 
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: number; name: string } | null>(null);
  
  const isLoading = navigation.state === "loading";

  const openDeleteModal = (id: number, name: string) => {
    setProductToDelete({ id, name });
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setProductToDelete(null);
  };

  // Function to calculate total inventory quantity for a product
  const getTotalInventory = (product: any) => {
    if (!product.inventoryItems || product.inventoryItems.length === 0) {
      return 0;
    }

    // If we have inventory items, calculate total based on base unit
    const baseUnitId = product.productUnits[0]?.id;
    
    return product.inventoryItems.reduce((total: number, item: any) => {
      // If item is in base unit, add directly
      if (item.productUnitId === baseUnitId) {
        return total + item.quantity;
      }
      
      // Otherwise, find the conversion factor and convert to base unit
      const conversionFactor = product.productUnits.find(
        (pu: any) => pu.id === item.productUnitId
      )?.conversionFactor || 1;
      
      return total + (item.quantity * conversionFactor);
    }, 0);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>
        <Link
          to="/admin/products/new"
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Thêm sản phẩm</span>
        </Link>
      </div>

      {/* Search and filter */}
      <div className="bg-white p-4 rounded-md shadow-md mb-6">
        <form method="get" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex-grow">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Tìm kiếm
            </label>
            <input
              type="text"
              id="search"
              name="search"
              placeholder="Tìm theo tên hoặc mã sản phẩm..."
              defaultValue={searchTerm}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Danh mục
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categoryId}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <span>Tìm kiếm</span>
            </button>
          </div>
        </form>
      </div>

      {/* Products table */}
      <div className="bg-white shadow-md rounded-md overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã SP
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên sản phẩm
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Danh mục
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Đơn vị cơ bản
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tồn kho
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vị trí
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((product) => {
                const baseUnit = product.productUnits[0]?.unit;
                const totalInventory = getTotalInventory(product);
                
                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {baseUnit?.name || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {totalInventory} {baseUnit?.name || ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.compartment 
                        ? `${product.compartment.row.cabinet.name} > ${product.compartment.row.name} > ${product.compartment.name}`
                        : "Chưa phân loại"
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-3">
                        <Link
                          to={`/admin/products/${product.id}`}
                          className="text-blue-600 hover:text-blue-900"
                          title="Chi tiết"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </Link>
                        <Link
                          to={`/admin/products/${product.id}/edit`}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Sửa"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => openDeleteModal(product.id, product.name)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    Không tìm thấy sản phẩm nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Hiển thị {((pagination.page - 1) * 10) + 1} đến {Math.min(pagination.page * 10, pagination.totalCount)} trong số {pagination.totalCount} sản phẩm
          </div>
          <div className="flex space-x-1">
            {pagination.page > 1 && (
              <Link
                to={`/admin/products?page=${pagination.page - 1}${searchTerm ? `&search=${searchTerm}` : ''}${categoryId ? `&category=${categoryId}` : ''}`}
                className="px-3 py-1 border rounded hover:bg-gray-100 flex items-center"
                title="Trang trước"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
              <Link
                key={pageNum}
                to={`/admin/products?page=${pageNum}${searchTerm ? `&search=${searchTerm}` : ''}${categoryId ? `&category=${categoryId}` : ''}`}
                className={`px-3 py-1 border rounded ${
                  pageNum === pagination.page
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </Link>
            ))}
            {pagination.page < pagination.totalPages && (
              <Link
                to={`/admin/products?page=${pagination.page + 1}${searchTerm ? `&search=${searchTerm}` : ''}${categoryId ? `&category=${categoryId}` : ''}`}
                className="px-3 py-1 border rounded hover:bg-gray-100 flex items-center"
                title="Trang tiếp"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && productToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="bg-white p-4 rounded-md shadow-md max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-4">Xác nhận xóa</h2>
            <p className="mb-4">
              Bạn có chắc chắn muốn xóa sản phẩm "{productToDelete.name}"?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={closeDeleteModal}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>Hủy</span>
              </button>
              <form action={`/admin/products/${productToDelete.id}/delete`} method="post">
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Xóa</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-25 flex items-center justify-center">
          <div className="bg-white p-4 rounded-md shadow-md">
            <p className="text-center">Đang tải...</p>
          </div>
        </div>
      )}
    </div>
  );
}
