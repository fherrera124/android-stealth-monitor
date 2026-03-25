FROM nginx:alpine

# Copiar configuración
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos estáticos del frontend (deben estar en la raíz del contexto)
COPY public/ /usr/share/nginx/html/

# Copiar screenshots (volumen se monta después)
RUN mkdir -p /usr/share/nginx/html/screenshots

EXPOSE 4001

CMD ["nginx", "-g", "daemon off;"]