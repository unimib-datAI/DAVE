import fetchJson from "@/lib/fetchJson";
import { z } from "zod";
import { createRouter } from "../context";
import { getAuthHeader } from "../get-auth-header";
import { serverConfig } from "@/lib/config/server";

export type GetAnnotationDetails = {
  props: {
    pageid: string;
    title: string;
    extract: string;
    thumbnail: {
      source: string;
    }
  }
}

const getAnnotationById = async (id: number, indexer: number) => {
  const response = await fetchJson<any, GetAnnotationDetails>(`${serverConfig.externalBackend.baseUri}/indexer/info`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
    },
    body: {
      id,
      indexer
    }
  });
  return response.props;
}

export const annotations = createRouter()
  .query('getAnnotationDetails', {
    input: z
      .object({
        id: z.number(),
        indexer: z.number()
      }),
    resolve: ({ input }) => {
      const { id, indexer } = input;
      return getAnnotationById(id, indexer);
    },
  })