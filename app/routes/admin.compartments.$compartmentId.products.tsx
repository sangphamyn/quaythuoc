import { useState, useEffect } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireAdmin } from "~/utils/session.server";

type CompartmentInfo = {
  id: number;
  name: string;
  description: string | null;
  row: {
    id: number;
    name: string;
    cabinet: {
      id: number;
      name: string;
    };
  };
};

type CompartmentProduct = {
  id: number;
  code: string;
  name: string;
  image: string | null;
  category: {
    name: string;
  };
  productUnits: {
    id: number;
    isBaseUnit: boolean;
    unit: {
      name: string;
    };
  }[];
};

type AvailableProduct = {
  id: number;
  code: string;
  name: string;
  category: {
    name: string;
  };
};

type LoaderData = {
  compartment: CompartmentInfo;
  compartmentProducts: CompartmentProduct[];
  availableProducts: AvailableProduct[];
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const compartmentId = parseInt(params.compartmentId as string);

  if (isNaN(compartmentId)) {
    throw new Response("Invalid compartment ID", { status: 400 });
  }

  // Lấy thông tin ngăn, bao gồm thông tin hàng và tủ
  const compartment = await db.compartment.findUnique({
    where: { id: compartmentId },
    include: {
      row: {
        include: {
          cabinet: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!compartment) {
    throw new Response("Compartment not found", { status: 404 });
  }

  // Lấy danh sách sản phẩm trong ngăn
  const compartmentProducts = await db.product.findMany({
    where: {
      compartmentId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      image: true,
      category: {
        select: {
          name: true,
        },
      },
      productUnits: {
        select: {
          id: true,
          isBaseUnit: true,
          unit: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          isBaseUnit: 'desc',
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  // Lấy danh sách sản phẩm chưa được gán vào bất kỳ ngăn nào
  const availableProducts = await db.product.findMany({
    where: {
      compartmentId: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return json<LoaderData>({
    compartment: {
      id: compartment.id,
      name: compartment.name,
      description: compartment.description,
      row: {
        id: compartment.row.id,
        name: compartment.row.name,
        cabinet: {
          id: compartment.row.cabinet.id,
          name: compartment.row.cabinet.name,
        },
      },
    },
    compartmentProducts,
    availableProducts,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const compartmentId = parseInt(params.compartmentId as string);

  if (isNaN(compartmentId)) {
    throw new Response("Invalid compartment ID", { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("_action") as string;

  // Xử lý thêm sản phẩm vào ngăn
  if (action === "add_product") {
    const productId = parseInt(formData.get("productId") as string);

    if (isNaN(productId)) {
      return json({ error: "Invalid product ID" }, { status: 400 });
    }

    await db.product.update({
      where: { id: productId },
      data: {
        compartmentId,
      },
    });

    return redirect(`/admin/compartments/${compartmentId}/products`);
  }

  // Xử lý xóa sản phẩm khỏi ngăn
  if (action === "remove_product") {
    const productId = parseInt(formData.get("productId") as string);

    if (isNaN(productId)) {
      return json({ error: "Invalid product ID" }, { status: 400 });
    }

    await db.product.update({
      where: { id: productId },
      data: {
        compartmentId: null,
      },
    });

    return redirect(`/admin/compartments/${compartmentId}/products`);
  }

  return null;
};

export default function CompartmentProducts() {
  const { compartment, compartmentProducts, availableProducts } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  // Lọc sản phẩm có sẵn dựa trên từ khóa tìm kiếm
  const filteredProducts = availableProducts.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Xử lý thêm sản phẩm vào ngăn
  const handleAddProduct = (productId: number) => {
    const formData = new FormData();
    formData.append("_action", "add_product");
    formData.append("productId", productId.toString());
    submit(formData, { method: "post" });
    setShowAddModal(false);
  };

  // Xử lý xóa sản phẩm khỏi ngăn
  const handleRemoveProduct = (productId: number) => {
    const formData = new FormData();
    formData.append("_action", "remove_product");
    formData.append("productId", productId.toString());
    submit(formData, { method: "post" });
    setConfirmRemove(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-2">
        <Link 
          to={`/admin/cabinets/${compartment.row.cabinet.id}/rows/${compartment.row.id}/compartments`} 
          className="text-indigo-600 hover:text-indigo-900 mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Tủ: {compartment.row.cabinet.name} / Hàng: {compartment.row.name} / Ngăn: {compartment.name}
        </h1>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Danh sách sản phẩm</h2>
          {compartment.description && (
            <p className="text-gray-500 mt-1">{compartment.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md 
            flex items-center transition-colors duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Thêm sản phẩm vào ngăn
        </button>
      </div>

      {/* Danh sách sản phẩm trong ngăn */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã sản phẩm
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
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {compartmentProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    Chưa có sản phẩm nào trong ngăn này.
                  </td>
                </tr>
              ) : (
                compartmentProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {
                        // Tìm đơn vị cơ bản
                        product.productUnits.find(unit => unit.isBaseUnit)?.unit.name ||
                        product.productUnits[0]?.unit.name ||
                        "Chưa có đơn vị"
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Link
                          to={`/admin/products/${product.id}`}
                          className="text-indigo-600 hover:text-indigo-900 p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => setConfirmRemove(product.id)}
                          className="text-red-600 hover:text-red-900 p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal thêm sản phẩm */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Thêm sản phẩm vào ngăn</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4">
              <input
                type="text"
                placeholder="Tìm kiếm sản phẩm (tên, mã)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="py-4 text-center text-gray-500">
                  {searchTerm ? "Không tìm thấy sản phẩm phù hợp" : "Không có sản phẩm nào chưa được gán vào ngăn"}
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mã sản phẩm
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tên sản phẩm
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Danh mục
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.code}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {product.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.category.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleAddProduct(product.id)}
                            disabled={isSubmitting}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            {isSubmitting ? "Đang thêm..." : "Thêm vào ngăn"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog xác nhận xóa */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Xác nhận gỡ sản phẩm</h3>
            <p className="text-gray-700 mb-4">
              Bạn có chắc chắn muốn gỡ sản phẩm này khỏi ngăn? Sản phẩm sẽ không bị xóa khỏi hệ thống mà chỉ không còn nằm trong ngăn này nữa.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => handleRemoveProduct(confirmRemove)}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700"
              >
                Gỡ khỏi ngăn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
