import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { AuthController } from "../controllers/auth";

const route = Router();

export default (app) => {
    app.use("/auth", route);
    route.post(
        "/login",
        asyncRoute(async (req, res) => {
            const { email, password } = req.body;
            const data = await AuthController.login(email, password);
            return res.json(data);
        }),
    );
    route.post(
        "/refresh",
        asyncRoute(async (req, res) => {
            const { refreshToken } = req.body;
            const data = await AuthController.refresh(refreshToken);
            return res.json(data);
        }),
    );
    route.get(
        "/me",
        asyncRoute(async (req, res) => {
            const auth = req.headers.authorization || "";
            const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
            if (!token)
                return res.status(401).json({ message: "Missing token" });
            const user = await AuthController.meFromJwt(token);
            return res.json({ user });
        }),
    );

    route.post(
        "/logout",
        asyncRoute(async (req, res) => {
            const { refreshToken } = req.body;
            await AuthController.logout(refreshToken);
            return res.json({ ok: true });
        }),
    );
};
