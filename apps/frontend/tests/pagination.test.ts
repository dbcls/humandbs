import { describe, it, expect } from "bun:test";
import { getVisiblePages } from "../src/components/Pagination";
import z from "zod";

describe("Pagination component", () => {
  it("should correclty generate general-form", () => {
    const totalPages = 100;
    const page = 50;

    const pagination = getVisiblePages(page, totalPages);

    expect(pagination).toEqual([1, "ellipsis", 49, 50, 51, "ellipsis", 100]);
  });

  it("should correctly show pages for beginning, totalPages=100, page=1", () => {
    const totalPages = 100;
    const page = 1;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2, 3, "ellipsis", 100]);
  });

  it("should correctly show pages for beginning, totalPages=100, page=2", () => {
    const totalPages = 100;
    const page = 2;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2, 3, "ellipsis", 100]);
  });
  it("should correctly show pages for beginning, totalPages=100, page=3", () => {
    const totalPages = 100;
    const page = 3;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2, 3, 4, "ellipsis", 100]);
  });

  it("should correctly show pages for ending, totalPages=100, page=100", () => {
    const totalPages = 100;
    const page = 100;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, "ellipsis", 98, 99, 100]);
  });
  it("should correctly show pages for ending, totalPages=100, page=99", () => {
    const totalPages = 100;
    const page = 100;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, "ellipsis", 98, 99, 100]);
  });
  it("should correctly show pages for ending, totalPages=100, page=100", () => {
    const totalPages = 100;
    const page = 99;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, "ellipsis", 98, 99, 100]);
  });
  it("should correctly show pages for ending, totalPages=100, page=98", () => {
    const totalPages = 100;
    const page = 98;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, "ellipsis", 97, 98, 99, 100]);
  });
  it("should correctly show pages for small totalPages, totalPages=1, page=1", () => {
    const totalPages = 1;
    const page = 1;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1]);
  });
  it("should correctly show pages for small totalPages, totalPages=2, page=2", () => {
    const totalPages = 2;
    const page = 2;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2]);
  });
  it("should correctly show pages for ending, totalPages=5, page=3", () => {
    const totalPages = 5;
    const page = 3;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2, 3, 4, 5]);
  });
  it("should correctly show pages for ending, totalPages=9, page=3", () => {
    const totalPages = 9;
    const page = 3;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, 2, 3, 4, "ellipsis", 9]);
  });
  it("should correctly show pages for ending, totalPages=9, page=4", () => {
    const totalPages = 9;
    const page = 4;
    const pagination = getVisiblePages(page, totalPages);
    expect(pagination).toEqual([1, "ellipsis", 3, 4, 5, "ellipsis", 9]);
  });
  it("z transform to number", () => {
    const S = z.coerce.number();

    const parsed = S.parse("4");

    console.log("parsed type", typeof parsed);

    expect(parsed).toBe(4);
  });
});
