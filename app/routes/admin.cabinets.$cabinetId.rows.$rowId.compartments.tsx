import { useState } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireAdmin } from "~/utils/session.server";

type Compartment = {
  id: number;
  name: string;
  description: string | null;
  _count: {
    products: number;
  };
};

type Row = {
  id: number;
  name: string;
  description: string | null;
};

type Cabinet = {
  id: number;
  name: string;
};

type LoaderData = {
  compartments: Compartment[];
  row: Row;
  cabinet: Cabinet;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const cabinetId = parseInt(params.cabinetId as string);
  const rowId = parseInt(params.rowId as string);

  if (isNaN(cabinetId) || isNaN(rowId)) {
    throw new Response("Invalid cabinet or row ID", { status: 400 });
  }

  // Lấy thông tin tủ
  const cabinet = await db.cabinet.findUnique({
    where: { id: cabinetId },
    select: {
      id: true,
      name: true,
    }
  });

  if (!cabinet) {
    throw new Response("Cabinet not found", { status: 404 });
  }

  // Lấy thông tin hàng
  const row = await db.row.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      name: true,
      description: true,
    }
  });

  if (!row) {
    throw new Response("Row not found", { status: 404 });
  }

  // Lấy danh sách ngăn trong hàng và số sản phẩm trong mỗi ngăn
  const compartments = await db.compartment.findMany({
    where: { rowId },
    include: {
      _count: {
        select: { products: true }
      }
    },
    orderBy: { name: "asc" }
  });

  return json<LoaderData>({ compartments, row, cabinet });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const cabinetId = parseInt(params.cabinetId as string);
  const rowId = parseInt(params.rowId as string);

  if (isNaN(cabinetId) || isNaN(rowId)) {
    throw new Response("Invalid cabinet or row ID", { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("_action") as string;

  // Xử lý thêm mới ngăn
  if (action === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên ngăn không được để trống" }, { status: 400 });
    }

    await db.compartment.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        rowId
      }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows/${rowId}/compartments`);
  }

  // Xử lý xóa ngăn
  if (action === "delete") {
    const compartmentId = parseInt(formData.get("compartmentId") as string);

    // Kiểm tra ngăn có chứa sản phẩm không
    const compartmentWithProducts = await db.compartment.findUnique({
      where: { id: compartmentId },
      include: { _count: { select: { products: true } } }
    });

    if (compartmentWithProducts && compartmentWithProducts._count.products > 0) {
      return json({
        error: "Không thể xóa ngăn này vì có sản phẩm bên trong. Vui lòng di chuyển sản phẩm trước."
      }, { status: 400 });
    }

    await db.compartment.delete({
      where: { id: compartmentId }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows/${rowId}/compartments`);
  }

  // Xử lý cập nhật ngăn
  if (action === "update") {
    const compartmentId = parseInt(formData.get("compartmentId") as string);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên ngăn không được để trống" }, { status: 400 });
    }

    await db.compartment.update({
      where: { id: compartmentId },
      data: {
        name: name.trim(),
        description: description?.trim() || null
      }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows/${rowId}/compartments`);
  }

  return null;
};

export default function RowCompartments() {
  const { compartments, row, cabinet } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCompartment, setEditingCompartment] = useState<Compartment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Xử lý xóa ngăn
  const handleDeleteCompartment = (compartmentId: number) => {
    const formData = new FormData();
    formData.append("_action", "delete");
    formData.append("compartmentId", compartmentId.toString());
    submit(formData, { method: "post" });
    setConfirmDelete(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-2">
        <Link to={`/admin/cabinets/${cabinet.id}/rows`} className="text-indigo-600 hover:text-indigo-900 mr-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Tủ: {cabinet.name} / Hàng: {row.name}
        </h1>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Danh sách ngăn</h2>
          {row.description && (
            <p className="text-gray-500 mt-1">{row.description}</p>
          )}
        </div>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setEditingCompartment(null);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md 
            flex items-center transition-colors duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Thêm ngăn mới
        </button>
      </div>

      {/* Form thêm mới ngăn */}
      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Thêm ngăn mới</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="create" />
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên ngăn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập tên ngăn"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập mô tả (không bắt buộc)"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Form chỉnh sửa ngăn */}
      {editingCompartment && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Chỉnh sửa ngăn</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="update" />
            <input type="hidden" name="compartmentId" value={editingCompartment.id} />
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên ngăn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-name"
                name="name"
                required
                defaultValue={editingCompartment.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={editingCompartment.description || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingCompartment(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Danh sách ngăn */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên ngăn
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mô tả
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số sản phẩm
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {compartments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                    Chưa có ngăn nào trong hàng này. Hãy thêm ngăn mới.
                  </td>
                </tr>
              ) : (
                compartments.map((compartment) => (
                  <tr key={compartment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {compartment.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {compartment.description || <span className="text-gray-400 italic">Không có mô tả</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Link 
                        to={`/admin/compartments/${compartment.id}/products`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {compartment._count.products} sản phẩm
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Link
                          to={`/admin/products?compartmentId=${compartment.id}`}
                          className="text-indigo-600 hover:text-indigo-900 p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => setEditingCompartment(compartment)}
                          className="text-blue-600 hover:text-blue-900 p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDelete(compartment.id)}
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

      {/* Dialog xác nhận xóa */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Xác nhận xóa</h3>
            <p className="text-gray-700 mb-4">
              Bạn có chắc chắn muốn xóa ngăn này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteCompartment(confirmDelete)}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
