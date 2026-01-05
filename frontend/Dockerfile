# -------- BUILD STAGE --------
FROM node:18-alpine AS build

WORKDIR /app

ARG REACT_APP_API_BASE
ENV REACT_APP_API_BASE=$REACT_APP_API_BASE

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build


# -------- PRODUCTION STAGE --------
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build files
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
