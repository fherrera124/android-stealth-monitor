FROM nginx:alpine

# Copiar configuración
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Crear directorio para screenshots (se monta desde volumen)
RUN mkdir -p /usr/share/nginx/html/screenshots

EXPOSE 4001

CMD ["nginx", "-g", "daemon off;"]