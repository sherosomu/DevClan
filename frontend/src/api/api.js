import axios from 'axios';
const api = axios.create({
    baseURL: "https://devclan-backend.onrender.com",
    withCredentials: true,
});

export default api;
