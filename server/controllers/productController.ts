import { prisma } from "../config/prisma.js";
import { Request, Response } from "express";

// Get /api/products/flash-deals
export const getFlashDeals = async (req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { stock: { gt: 0 } },
    orderBy: { originalPrice: "desc" },
  });

  const productsWithDiscount = products.map((p: any) => {
    const discount =
      p.originalPrice && p.price
        ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
        : 0;
    return { ...p, discount };
  });

  res.json({ products: productsWithDiscount.slice(0, 8) });
};

// GET /api/products
export const getProducts = async (req: Request, res: Response) => {
  const { category, search, minPrice, maxPrice, sort } = req.query;

  const where: any = {};
  if (category && category !== "all") where.category = category as string;
  if (search) where.name = { contains: search as string, mode: "insensitive" };
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }
  const orderBy: any = {};
  if (sort === "price-low") orderBy.price = "asc";
  else if (sort === "price-high") orderBy.price = "desc";
  else orderBy.createdAt = "desc";

  const products = await prisma.product.findMany({ where, orderBy });

  const productsWithDiscount = products.map((p: any) => {
    const discount =
      p.originalPrice && p.price
        ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
        : 0;
    return { ...p, discount };
  });

  res.json({ products: productsWithDiscount });
};

// GET /api/products/:id
export const getProduct = async (req: Request, res: Response) => {
  console.log("HIT getProduct", req.params.id);
  const product = await prisma.product.findUnique({
    where: { id: req.params.id as string },
  });
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const discount =
    product.originalPrice && product.price
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : 0;
  console.log("HIT getProduct", req.params.id);
  return res.status(200).json({ product: { ...product, discount } });
};

// POST /api/products
export const createProduct = async (req: Request, res: Response) => {
  const product = await prisma.product.create({ data: req.body });
  res.status(201).json({ product });
};

// PUT /api/products/:id
export const updateProduct = async (req: Request, res: Response) => {
  const product = await prisma.product.update({
    where: { id: req.params.id as string },
    data: req.body,
  });
  res.status(200).json({ product });
};

// DELETE /api/products/:id
export const deleteProduct = async (req: Request, res: Response) => {
  await prisma.product.update({
    where: { id: req.params.id as string },
    data: { stock: Number(0) },
  });
  res.status(200).json({ message: "Product Updated" });
};
