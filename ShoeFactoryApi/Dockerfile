# =========================
# 1. Build React frontend
# =========================
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# =========================
# 2. Build ASP.NET Core API
# =========================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api-build

WORKDIR /src

COPY ShoeFactoryApi/ShoeFactoryApi.csproj ShoeFactoryApi/
RUN dotnet restore ShoeFactoryApi/ShoeFactoryApi.csproj

COPY ShoeFactoryApi/ ShoeFactoryApi/

# Copy React production build output into ASP.NET Core wwwroot
COPY --from=frontend-build /frontend/ShoeFactoryApi/wwwroot ./ShoeFactoryApi/wwwroot

WORKDIR /src/ShoeFactoryApi

RUN dotnet publish ShoeFactoryApi.csproj \
    -c Release \
    -o /app/publish \
    --no-restore


# =========================
# 3. Production runtime
# =========================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app

# Required for pg_dump backup service
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080

EXPOSE 8080

COPY --from=api-build /app/publish .

ENTRYPOINT ["dotnet", "ShoeFactoryApi.dll"]