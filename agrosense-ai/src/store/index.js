import { configureStore } from "@reduxjs/toolkit";
import soilReducer from "./soilSlice";

export const store = configureStore({
  reducer: {
    soil: soilReducer,
  },
});
