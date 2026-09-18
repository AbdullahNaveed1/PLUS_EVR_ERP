FROM node:20 AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ShoeFactoryApi/ShoeFactoryApi.csproj ShoeFactoryApi/
RUN dotnet restore ShoeFactoryApi/ShoeFactoryApi.csproj

COPY ShoeFactoryApi/ ShoeFactoryApi/
COPY --from=frontend-build /app/dist ShoeFactoryApi/wwwroot
WORKDIR /src/ShoeFactoryApi
RUN dotnet publish ShoeFactoryApi.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ShoeFactoryApi.dll"]
